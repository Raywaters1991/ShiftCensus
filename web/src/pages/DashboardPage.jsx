import { useEffect, useState } from "react";
import api from "../services/api";

const shiftBlocks = [
  { key: "Day", label: "Day Shift", color: "#FFEB3B" },     // bright yellow
  { key: "Evening", label: "Evening Shift", color: "#42A5F5" }, // bright blue
  { key: "Night", label: "Night Shift", color: "#9575CD" },  // bright purple
];

export default function DashboardPage() {
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [census, setCensus] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    loadData();

    // refresh data every 5 seconds
    const dataInterval = setInterval(loadData, 5000);
    // tick clock every second
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

  // determine shift from start time
  const getShiftType = (start) => {
    const hour = new Date(start).getHours();
    if (hour >= 6 && hour < 14) return "Day";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  const calcHours = (start, end) => {
    const s = new Date(start);
    const e = new Date(end);
    const diff = (e - s) / 3600000;
    return diff > 0 ? diff : 0;
  };

  // what shift is it right now (for glow)
  const currentShiftKey = (() => {
    const h = currentTime.getHours();
    if (h >= 6 && h < 14) return "Day";
    if (h >= 14 && h < 22) return "Evening";
    return "Night";
  })();

  const renderShiftCard = (block) => {
    const { key, label, color } = block;

    // shifts for this shift type
    const shiftList = shifts.filter(
      (shift) => getShiftType(shift.start_time) === key
    );

    // licensed staff bucketed by unit + role
    const licensed = {
      "A Wing": { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
      "B Wing": { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
      Middle: { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
    };

    // CNA assignment groups 1–5
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

      // Licensed staff (RN/LPN)
      if ((worker.role === "RN" || worker.role === "LPN") && licensed[shift.unit]) {
        if (worker.role === "RN") {
          licensed[shift.unit].RN += 1;
          licensed[shift.unit].hoursRN += hours;
        } else {
          licensed[shift.unit].LPN += 1;
          licensed[shift.unit].hoursLPN += hours;
        }
      }

      // CNAs with assignment_number 1–5
      if (worker.role === "CNA" && shift.assignment_number) {
        const group = cnaGroups[shift.assignment_number];
        if (group) {
          group.count += 1;
          group.hours += hours;
        }
      }
    });

    return (
      <div
        key={key}
        style={{
          background: color,
          color: "#000",
          padding: "24px",
          borderRadius: "18px",
          boxShadow:
            currentShiftKey === key
              ? "0 0 32px rgba(255,255,255,0.9)"
              : "0 10px 18px rgba(0,0,0,0.45)",
          border:
            currentShiftKey === key ? "4px solid #ffffff" : "2px solid rgba(0,0,0,0.3)",
          transition: "box-shadow 0.2s, transform 0.2s, border 0.2s",
          transform: currentShiftKey === key ? "translateY(-4px)" : "none",
        }}
      >
        <h2
          style={{
            marginTop: 0,
            marginBottom: "12px",
            fontSize: "28px",
            fontWeight: "800",
          }}
        >
          {label}
        </h2>

        {/* LICENSED STAFF */}
        <h3
          style={{
            marginTop: "4px",
            marginBottom: "6px",
            fontSize: "18px",
            fontWeight: "700",
          }}
        >
          Licensed Staff
        </h3>
        {Object.entries(licensed).map(([unit, data]) => {
          const lines = [];

          if (data.RN > 0) {
            lines.push(
              `RN ${unit}: ${data.RN}   Hrs: ${data.hoursRN.toFixed(1)}`
            );
          }
          if (data.LPN > 0) {
            lines.push(
              `LPN ${unit}: ${data.LPN}   Hrs: ${data.hoursLPN.toFixed(1)}`
            );
          }

          if (lines.length === 0) return null;

          return (
            <div key={unit} style={{ marginBottom: "4px", fontSize: "16px" }}>
              {lines.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          );
        })}

        {/* CNAs */}
        <h3
          style={{
            marginTop: "16px",
            marginBottom: "6px",
            fontSize: "18px",
            fontWeight: "700",
          }}
        >
          CNAs
        </h3>
        {Object.entries(cnaGroups)
          .filter(([_, data]) => data.count > 0)
          .map(([num, data]) => (
            <div key={num} style={{ fontSize: "16px" }}>
              CNA {num}: {data.count}   Hrs: {data.hours.toFixed(1)}
            </div>
          ))}

        {/* If absolutely nothing, show a gentle message */}
        {shiftList.length === 0 && (
          <div style={{ marginTop: "8px", fontStyle: "italic", fontSize: "14px" }}>
            No staff scheduled for this shift yet.
          </div>
        )}
      </div>
    );
  };

  return (
    <div style={{ padding: "24px", fontFamily: "Arial", color: "#fff" }}>
      <h1 style={{ fontSize: "36px", marginBottom: "4px" }}>ShiftCensus Dashboard</h1>
      <div style={{ fontSize: "18px", marginBottom: "20px", opacity: 0.8 }}>
        Current Time: {currentTime.toLocaleString()}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
          gap: "24px",
        }}
      >
        {shiftBlocks.map(renderShiftCard)}
      </div>
    </div>
  );
}
