// web/src/pages/StaffingDashboard.jsx
import { useEffect, useState } from "react";
import api from "../services/api";

export default function StaffingDashboard() {
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const shiftRes = await api.get("/shifts");
      const staffRes = await api.get("/staff");

      setShifts(shiftRes.data);
      setStaff(staffRes.data);
    } catch (err) {
      console.error("Dashboard failed to load:", err);
    }
  };

  // -------------------------------------------------------
  // 🕒 Convert stored UTC timestamp to a JS Date
  // -------------------------------------------------------
  const toDate = (dt) => (dt ? new Date(dt) : null);

  // -------------------------------------------------------
  // 🌓 Determine shift by START TIME (local time)
  // -------------------------------------------------------
  const getShiftType = (start) => {
    if (!start) return null;
    const hour = start.getHours();

    if (hour >= 6 && hour < 14) return "Day";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  // -------------------------------------------------------
  // ⏱ Calculate shift hours, correctly handling overnight shifts
  // -------------------------------------------------------
  const calcHours = (start, end) => {
    if (!start || !end) return 0;
    let diff = end - start;

    // Overnight shift fix (end next day)
    if (diff < 0) {
      diff += 24 * 3600 * 1000;
    }

    return Math.round((diff / 3600000) * 10) / 10;
  };

  // -------------------------------------------------------
  // 🧮 Group shifts by shift type (Day, Evening, Night)
  // -------------------------------------------------------
  const classifyShifts = () => {
    const groups = {
      Day: [],
      Evening: [],
      Night: [],
    };

    shifts.forEach((shift) => {
      const start = toDate(shift.start_time);
      const end = toDate(shift.end_time);
      const worker = staff.find((s) => s.id === shift.staff_id);

      if (!start || !worker) return;

      const type = getShiftType(start);
      if (!type) return;

      groups[type].push({
        ...shift,
        worker,
        hours: calcHours(start, end),
      });
    });

    return groups;
  };

  const grouped = classifyShifts();

  const cardStyle = {
    flex: 1,
    padding: "20px",
    borderRadius: "18px",
    boxShadow: "0 0 20px rgba(255,255,255,0.3)",
    margin: "10px",
    minHeight: "350px",
    color: "black",
  };

  const shiftColors = {
    Day: "#FFE74C",
    Evening: "#54a7ff",
    Night: "#b184e3",
  };

  const renderShiftGroup = (title, items) => (
    <div style={{ ...cardStyle, background: shiftColors[title] }}>
      <h2>{title} Shift</h2>

      <h3>Licensed Staff</h3>
      {items.filter((x) => x.worker.role !== "CNA").length === 0 && (
        <p style={{ fontStyle: "italic" }}>No licensed staff scheduled.</p>
      )}

      {items
        .filter((x) => x.worker.role !== "CNA")
        .map((x) => (
          <p key={x.id}>
            {x.worker.role} {x.unit ? x.unit : ""}: {x.hours} hrs
          </p>
        ))}

      <h3 style={{ marginTop: "20px" }}>CNAs</h3>
      {items.filter((x) => x.worker.role === "CNA").length === 0 && (
        <p style={{ fontStyle: "italic" }}>No CNAs scheduled.</p>
      )}

      {items
        .filter((x) => x.worker.role === "CNA")
        .map((x) => (
          <p key={x.id}>
            CNA {x.unit ? x.unit : ""}: {x.hours} hrs
          </p>
        ))}
    </div>
  );

  return (
    <div style={{ color: "white", padding: "20px", minHeight: "100vh" }}>
      <h1>ShiftCensus Dashboard</h1>

      <p style={{ marginBottom: "20px" }}>
        Current Time: {new Date().toLocaleString()}
      </p>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "20px",
        }}
      >
        {renderShiftGroup("Day", grouped.Day)}
        {renderShiftGroup("Evening", grouped.Evening)}
        {renderShiftGroup("Night", grouped.Night)}
      </div>
    </div>
  );
}
