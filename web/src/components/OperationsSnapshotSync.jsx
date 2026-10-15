import { useEffect } from "react";
import api from "../services/api";
import { saveOfflineOperationsSnapshot } from "../services/offlineCache.js";
import { useUser } from "../contexts/UserContext.jsx";

// The offline copy is insurance, not live UI data. Refreshing it every minute made
// the browser and API do unnecessary work while users were actively using the app.
const SNAPSHOT_REFRESH_MS = 5 * 60_000;
const MIN_SYNC_GAP_MS = 60_000;
const WORKFLOW_REFRESH_MS = 15_000;

const requestSignature = (rows) =>
  (Array.isArray(rows) ? rows : [])
    .map((x) => [x.id, x.status, x.decided_at || "", x.employee_seen_at || ""].join(":"))
    .sort()
    .join("|");

export default function OperationsSnapshotSync() {
  const { user, orgId, orgCode, orgName, permissions, isSuperadmin } = useUser();

  // Keep the request -> manager decision -> employee schedule loop fresh while the
  // app is open. We intentionally reload only workflow-sensitive screens and only
  // after the server state actually changes, so normal navigation is unaffected.
  useEffect(() => {
    if (!user || (!orgId && !orgCode)) return;

    let cancelled = false;
    let checking = false;
    let employeeSignature = null;
    let managerPendingCount = null;

    const canReview = !!isSuperadmin || !!permissions?.can_schedule_write;
    const workflowPath = () => window.location.pathname;
    const employeeScreen = () => ["/requests", "/my-schedule", "/open-shifts"].includes(workflowPath());
    const managerScreen = () => workflowPath() === "/request-review";

    async function checkWorkflow() {
      if (cancelled || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const jobs = [api.get("/shift-requests/my")];
        if (canReview) jobs.push(api.get("/shift-requests/review-access"));
        const [mine, review] = await Promise.all(jobs);
        if (cancelled) return;

        const nextEmployeeSignature = requestSignature(mine);
        if (employeeSignature !== null && nextEmployeeSignature !== employeeSignature && employeeScreen()) {
          window.location.reload();
          return;
        }
        employeeSignature = nextEmployeeSignature;

        if (canReview) {
          const nextPendingCount = Number(review?.pending_count || 0);
          if (managerPendingCount !== null && nextPendingCount !== managerPendingCount && managerScreen()) {
            window.location.reload();
            return;
          }
          managerPendingCount = nextPendingCount;
        }
      } catch (e) {
        // Workflow polling is best-effort. Existing page data remains usable and
        // normal API actions still surface their own errors.
        console.warn("Workflow state not refreshed", e);
      } finally {
        checking = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") checkWorkflow();
    };
    const onFocus = () => checkWorkflow();
    const onOnline = () => checkWorkflow();

    checkWorkflow();
    const timer = window.setInterval(checkWorkflow, WORKFLOW_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
    };
  }, [user, orgId, orgCode, permissions, isSuperadmin]);

  useEffect(() => {
    if (!user || (!orgId && !orgCode)) return;
    const canRead = isSuperadmin || permissions?.can_schedule_read || permissions?.can_schedule_write;
    if (!canRead) return;

    let cancelled = false;
    let syncing = false;
    let lastSyncAt = 0;
    async function sync({ force = false } = {}) {
      if (cancelled || syncing || document.visibilityState === "hidden") return;
      if (!force && Date.now() - lastSyncAt < MIN_SYNC_GAP_MS) return;
      syncing = true;
      try {
        const data = await api.get("/operations-snapshot", { cache: false });
        if (cancelled) return;
        lastSyncAt = Date.now();
        saveOfflineOperationsSnapshot({
          orgId,
          orgCode,
          orgName,
          date: data?.date || null,
          timezone: data?.timezone || null,
          shifts: Array.isArray(data?.shifts) ? data.shifts : [],
          staff: Array.isArray(data?.staff) ? data.staff : [],
          units: Array.isArray(data?.units) ? data.units : [],
          assignments: Array.isArray(data?.assignments) ? data.assignments : [],
        });
      } catch (e) {
        // Preserve the previous Last Known Good snapshot on any failure.
        console.warn("Operations snapshot not updated", e);
      } finally {
        syncing = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    // A restored connection is worth an immediate fresh snapshot.
    const onOnline = () => sync({ force: true });

    sync({ force: true });
    const timer = window.setInterval(sync, SNAPSHOT_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [user, orgId, orgCode, orgName, permissions, isSuperadmin]);

  return null;
}
