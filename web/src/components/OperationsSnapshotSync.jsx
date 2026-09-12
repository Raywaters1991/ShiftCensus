import { useEffect } from "react";
import api from "../services/api";
import { saveOfflineOperationsSnapshot } from "../services/offlineCache.js";
import { useUser } from "../contexts/UserContext.jsx";

function todayYmd(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}

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
        const date=todayYmd();
        const [shifts, staff, units, assignments] = await Promise.all([
          api.get(`/shifts?date=${date}`), api.get("/staff"), api.get("/units"), api.get(`/shift-assignments?date=${date}`)
        ]);
        if (cancelled) return;
        saveOfflineOperationsSnapshot({ orgId, orgCode, orgName, shifts, staff, units, assignments });
      } catch (e) {
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
