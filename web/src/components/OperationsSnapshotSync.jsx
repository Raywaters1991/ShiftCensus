import { useEffect } from "react";
import api from "../services/api";
import { saveOfflineOperationsSnapshot } from "../services/offlineCache.js";
import { useUser } from "../contexts/UserContext.jsx";

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

  // Poll workflow state quietly. Never reload the document: a reload destroys the
  // current screen/scroll position and makes returning to the app feel like a cold
  // launch. Screens that care about changes can listen for this lightweight event
  // and refresh their own data in place.
  useEffect(() => {
    if (!user || (!orgId && !orgCode)) return;

    let cancelled = false;
    let checking = false;
    let employeeSignature = null;
    let managerPendingCount = null;
    const canReview = !!isSuperadmin || !!permissions?.can_schedule_write;

    const announce = (detail) => {
      window.dispatchEvent(new CustomEvent("shiftcensus:workflow-changed", { detail }));
    };

    async function checkWorkflow() {
      if (cancelled || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const jobs = [api.get("/shift-requests/my")];
        if (canReview) jobs.push(api.get("/shift-requests/review-access"));
        const [mine, review] = await Promise.all(jobs);
        if (cancelled) return;

        const nextEmployeeSignature = requestSignature(mine);
        if (employeeSignature !== null && nextEmployeeSignature !== employeeSignature) {
          announce({ employeeRequestsChanged: true });
        }
        employeeSignature = nextEmployeeSignature;

        if (canReview) {
          const nextPendingCount = Number(review?.pending_count || 0);
          if (managerPendingCount !== null && nextPendingCount !== managerPendingCount) {
            announce({ managerRequestsChanged: true, pendingCount: nextPendingCount });
          }
          managerPendingCount = nextPendingCount;
        }
      } catch (e) {
        console.warn("Workflow state not refreshed", e);
      } finally {
        checking = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") checkWorkflow();
    };
    const onOnline = () => checkWorkflow();

    checkWorkflow();
    const timer = window.setInterval(checkWorkflow, WORKFLOW_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
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
        console.warn("Operations snapshot not updated", e);
      } finally {
        syncing = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
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
