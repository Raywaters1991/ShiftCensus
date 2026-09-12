import { useEffect } from "react";
import api from "../services/api";
import { saveOfflineOperationsSnapshot } from "../services/offlineCache.js";
import { useUser } from "../contexts/UserContext.jsx";

export default function OperationsSnapshotSync() {
  const { user, orgId, orgCode, orgName, permissions, isSuperadmin } = useUser();

  useEffect(() => {
    if (!user || (!orgId && !orgCode)) return;
    const canRead = isSuperadmin || permissions?.can_schedule_read || permissions?.can_schedule_write;
    if (!canRead) return;

    let cancelled = false;
    let syncing = false;
    async function sync() {
      if (cancelled || syncing || document.visibilityState === "hidden") return;
      syncing = true;
      try {
        const data = await api.get("/operations-snapshot");
        if (cancelled) return;
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
      } finally { syncing = false; }
    }

    const onVisible=()=>{if(document.visibilityState==="visible")sync();};
    sync();
    const timer = window.setInterval(sync, 300000);
    document.addEventListener("visibilitychange",onVisible);
    return () => { cancelled = true; window.clearInterval(timer); document.removeEventListener("visibilitychange",onVisible); };
  }, [user, orgId, orgCode, orgName, permissions, isSuperadmin]);

  return null;
}
