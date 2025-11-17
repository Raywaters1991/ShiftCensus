import { useEffect, useState } from "react";
import api from "../services/api";
import { supabase } from "../services/supabaseClient";

export default function StaffingDashboard() {
  const [census, setCensus] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);

  const loadCensus = async () => {
    const res = await api.get("/census");
    setCensus(res.data);
  };

  const loadShifts = async () => {
    const res = await api.get("/shifts");
    setShifts(res.data);
  };

  const loadStaff = async () => {
    const res = await api.get("/staff");
    setStaff(res.data);
  };

  // Realtime listeners
  useEffect(() => {
    loadCensus();
    loadShifts();
    loadStaff();

    const censusChannel = supabase
      .channel("census-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "census" }, loadCensus)
      .subscribe();

    const shiftChannel = supabase
      .channel("shifts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, loadShifts)
      .subscribe();

    const staffChannel = supabase
      .channel("staff-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, loadStaff)
      .subscribe();

    return () => {
      supabase.removeChannel(censusChannel);
      supabase.removeChannel(shiftChannel);
      supabase.removeChannel(staffChannel);
    };
  }, []);

  // Active shifts = staff currently on duty
  const now = new Date();
  const activeShifts = shifts.filter(
    (s) => new Date(s.start_time) <= now && new Date(s.end_time) >= now
  );

  const totalResidents = census.filter((r) => r.status === "Occupied").length;

  const activeRNs = activeShifts.filter((s) => s.role === "RN").length;
  const activeLPNs = activeShifts.filter((s) => s.role === "LPN").length;
  const activeCNAs = activeShifts.filter((s) => s.role === "CNA").length;

  const nurseCount = activeRNs + activeLPNs;

  const cnaRatio = activeCNAs > 0 ? (totalResidents / activeCNAs).toFixed(1) : "-";
  const nurseRatio = nurseCount > 0 ? (totalResidents / nurseCount).toFixed(1) : "-";

  return (
    <div style={{ padding: "20px", fontFamily: "Arial" }}>
      <h1>Staffing Dashboard</h1>

      {/* Census Summary */}
      <div style={{ marginBottom: "30px" }}>
        <h2>Census Summary</h2>
        <div>Total Residents: <b>{totalResidents}</b></div>
        <div>Total Rooms: {census.length}</div>
      </div>

      {/* Active Staff */}
      <div style={{ marginBottom: "30px" }}>
        <h2>Staff Currently on Duty</h2>
        <div>RNs: <b>{activeRNs}</b></div>
        <div>LPNs: <b>{activeLPNs}</b></div>
        <div>CNAs: <b>{activeCNAs}</b></div>
      </div>

      {/* Basic Ratios (no warnings) */}
      <div style={{ marginBottom: "30px" }}>
        <h2>Ratios</h2>
        <div>CNA Ratio: {cnaRatio !== "-" ? `1 CNA per ${cnaRatio} residents` : "No CNAs on duty"}</div>
        <div>Nurse Ratio (RN+LPN): {nurseRatio !== "-" ? `1 nurse per ${nurseRatio} residents` : "No nurses on duty"}</div>
      </div>
    </div>
  );
}
