import { useEffect, useState } from "react";
import api from "../services/api";

// Block styling
const shiftBlocks = [
  { key: "Day", label: "Day Shift", color: "#FFEB3B" },
  { key: "Evening", label: "Evening Shift", color: "#42A5F5" },
  { key: "Night", label: "Night Shift", color: "#9575CD" },
];

export default function DashboardPage() {
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [census, setCensus] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  /* ------------------------------------------------
     LOAD DATA + CLOCK TICK
  -------------------------------------------------- */
  useEffect(() => {
    loadData();
    const dataInterval = setInterval(loadData, 5000);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(dataInterval);
      clearInterval(clockInterval);
    };
  }, []);

  const loadData = async () => {
    const [shiftRes, staffRes, censusRes] = await Promise.all([
      api.get("/shifts"),
      api.get("/staff"),
      api.get("/census"),
    ]);

    setShifts(shiftRes.data);
    setStaff(staffRes.data);
    setCensus(censusRes.data);
  };

  /* ------------------------------------------------
     SHIFT CLASSIFICATION (fixed!)
  -------------------------------------------------- */
  const getShiftType = (start, role) => {
    const hour = new Date(start).getHours();

    // Nurses follow strict 12-hour blocks:
    // Day = 06–18, Night = 18–06
    if (role === "RN" || role === "LPN") {
      if (hour >= 6 && hour < 18) return "Day";
      return "Night";
    }

    // CNA 8-hour shifts
    if (hour >= 6 && hour < 14) return "Day";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  const calcHours = (start, end) => {
    const s = new Date(start);
    const e = new Date(end);
    return Math.max((e - s) / 3600000, 0);
  };

  /* ------------------------------------------------
     TODAY & CURRENT SHIFT (fixed to nurse logic)
  -------------------------------------------------- */
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const currentShiftKey = (() => {
    const h = currentTime.getHours();
    // RN/LPN logic for highlighting blocks
    if (h >= 6 && h < 18) return "Day";
    return "Night";
  })();

  /* ------------------------------------------------
     RENDER SINGLE SHIFT BLOCK
  -------------------------------------------------- */
  const renderShiftCard = (block) => {
    const { key, label, color } = block;

    // Filter today's shifts only
    const todayShiftList = shifts.filter((shift) => {
      const d = new Date(shift.start_time);
      d.setHours(0, 0, 0, 0);
      return d.getTime() === todayMidnight.getTime();
    });

    // Correct role-aware shift filtering
    const shiftList = todayShiftList.filter((shift) => {
      const worker = staff.find((s) => s.id === shift.staff_id);
      if (!worker) return false;
      return getShiftType(shift.start_time, worker.role) === key;
    });

    // Licensed + CNA tracking
    const licensed = {
      "A Wing": { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
      "B Wing": { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
      Middle: { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
    };

    const cnaGroups = {
      1: { count: 0, hours: 0 },
      2: { count: 0, hours: 0 },
      3: { count: 0, hours: 0 },
      4: { count: 0, hours: 0 },
      5: { count: 0, hours: 0 },
    };

    shiftList.forEach((shift) => {
      const worker = staff.find((s) => s.id === shift.staff_id);
      if (!worker) return;

      const hours = calcHours(shift.start_time, shift.end_time);

      if (worker.role === "RN" || worker.role === "LPN") {
        if (licensed[shift.unit]) {
          if (worker.role === "RN") {
            licensed[shift.unit].RN += 1;
            licensed[shift.unit].hoursRN += hours;
          } else {
            licensed[shift.unit].LPN += 1;
            licensed[shift.unit].hoursLPN += hours;
          }
        }
      }

      if (worker.role === "CNA" && shift.assignment_number) {
        const g = cnaGroups[shift.assignment_number];
        if (g) {
          g.count += 1;
          g.hours += hours;
        }
      }
    });

    return (
      <div
        key={key}
        style={{
          background: color,
          padding: "24px",
          borderRadius: "18px",
          color: "#000",
          boxShadow:
            currentShiftKey === key
              ? "0 0 32px rgba(255,255,255,0.9)"
              : "0 10px 18px rgba(0,0,0,0.4)",
          border:
            currentShiftKey === key
              ? "4px solid #fff"
              : "2px solid rgba(0,0,0,0.3)",
          transform: currentShiftKey === key ? "translateY(-4px)" : "",
          transition: "0.3s",
        }}
      >
        <h2 style={{ fontWeight: "800", marginTop: 0 }}>{label}</h2>

        {/* Licensed nurses */}
        <h3 style={{ marginBottom: "6px", fontWeight: "700" }}>
          Licensed Staff
        </h3>

        {Object.entries(licensed).map(([unit, d]) => {
          const rows = [];
          if (d.RN > 0) rows.push(`RN ${unit}: ${d.RN} | Hrs: ${d.hoursRN.toFixed(1)}`);
          if (d.LPN > 0) rows.push(`LPN ${unit}: ${d.LPN} | Hrs: ${d.hoursLPN.toFixed(1)}`);

          return rows.length ? (
            <div key={unit} style={{ marginBottom: "4px" }}>
              {rows.map((r, i) => (
                <div key={i}>{r}</div>
              ))}
            </div>
          ) : null;
        })}

        {/* CNA Groups */}
        <h3 style={{ marginTop: "14px", fontWeight: "700" }}>CNAs</h3>
        {Object.entries(cnaGroups)
          .filter(([_, g]) => g.count > 0)
          .map(([num, g]) => (
            <div key={num}>
              CNA {num}: {g.count} | Hrs: {g.hours.toFixed(1)}
            </div>
          ))}

        {shiftList.length === 0 && (
          <div style={{ fontStyle: "italic", marginTop: "10px" }}>
            No staff scheduled for this shift today.
          </div>
        )}
      </div>
    );
  };

  /* ------------------------------------------------
     RENDER PAGE
  -------------------------------------------------- */
  return (
    <div style={{ padding: "24px", fontFamily: "Arial", color: "var(--text)" }}>
      <h1>ShiftCensus Dashboard</h1>

      <div style={{ opacity: 0.8, marginBottom: "16px" }}>
        Current Time: {currentTime.toLocaleString()}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "24px",
        }}
      >
        {shiftBlocks.map(renderShiftCard)}
      </div>
    </div>
  );
}
