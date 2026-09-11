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
    async function sync() {
      try {
        const [shifts, staff, units, assignments] = await Promise.all([
          api.get("/shifts"), api.get("/staff"), api.get("/units"), api.get("/assignments")
        ]);
        if (cancelled) return;
        saveOfflineOperationsSnapshot({ orgId, orgCode, orgName, shifts, staff, units, assignments });
      } catch (e) {
        // Preserve the previous Last Known Good snapshot on any partial failure.
        console.warn("Operations snapshot not updated", e);
      }
    }

    sync();
    const timer = window.setInterval(sync, 60000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [user, orgId, orgCode, orgName, permissions, isSuperadmin]);

  return null;
}
