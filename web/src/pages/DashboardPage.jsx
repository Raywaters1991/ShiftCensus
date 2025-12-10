// src/pages/DashboardPage.jsx
import { useEffect, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";

const SHIFT_BLOCKS = [
  { key: "Day", label: "Day Shift" },
  { key: "Evening", label: "Evening Shift" },
  { key: "Night", label: "Night Shift" },
];

/* -----------------------------------------------------------
   UNIVERSAL TIMESTAMP PARSER — FIXES "INVALID DATE"
------------------------------------------------------------ */
function parseTS(value) {
  if (!value) return null;

  let iso = value;

  // If backend sends "YYYY-MM-DD HH:MM:SS+00", fix it
  if (typeof iso === "string" && iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
  }

  // Convert to Date()
  const d = new Date(iso);

  // Prevent invalid date crashes
  return isNaN(d.getTime()) ? null : d;
}

export default function DashboardPage() {
  const { orgLogo } = useUser();

  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [census, setCensus] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);

  /* -----------------------------------------------------------
     LOAD ALL DASHBOARD DATA
  ------------------------------------------------------------ */
  useEffect(() => {
    loadData();

    const refreshInterval = setInterval(loadData, 5000);
    const clockInterval = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      clearInterval(refreshInterval);
      clearInterval(clockInterval);
    };
  }, []);

  async function loadData() {
    try {
      const [shiftRes, staffRes, censusRes] = await Promise.all([
        api.get("/shifts"),
        api.get("/staff"),
        api.get("/census"),
      ]);

      console.log("SHIFT API →", shiftRes);
      console.log("STAFF API →", staffRes);
      console.log("CENSUS API →", censusRes);

      // FIX: Normalize timestamps on load
      const normalizedShifts = (shiftRes || []).map((s) => ({
        ...s,
        start_time: parseTS(s.start_time),
        end_time: parseTS(s.end_time),
      }));

      setShifts(normalizedShifts);
      setStaff(Array.isArray(staffRes) ? staffRes : []);
      setCensus(Array.isArray(censusRes) ? censusRes : []);
    } catch (err) {
      console.error("Dashboard load error:", err);
    }

    setLoading(false);
  }

  /* -----------------------------------------------------------
     SHIFT TYPE LOGIC
  ------------------------------------------------------------ */
  const getShiftType = (startTime, role) => {
    if (!startTime) return "Unknown";

    const hour = startTime.getHours();

    if (role === "RN" || role === "LPN") {
      return hour >= 6 && hour < 18 ? "Day" : "Night";
    }

    if (hour >= 6 && hour < 14) return "Day";
    if (hour >= 14 && hour < 22) return "Evening";
    return "Night";
  };

  const calcHours = (start, end) => {
    if (!start || !end) return 0;
    return Math.max((end - start) / 3600000, 0);
  };

  const todayMidnight = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  const currentShiftKey = (() => {
    const h = currentTime.getHours();
    if (h >= 6 && h < 14) return "Day";
    if (h >= 14 && h < 22) return "Evening";
    return "Night";
  })();

  /* -----------------------------------------------------------
     RENDER SINGLE SHIFT CARD
  ------------------------------------------------------------ */
  const renderShiftCard = ({ key, label }) => {
    if (!Array.isArray(shifts) || !Array.isArray(staff)) return null;

    const todayShifts = shifts.filter((shift) => {
      if (!shift.start_time) return false;

      const d = new Date(shift.start_time);
      d.setHours(0, 0, 0, 0);

      return d.getTime() === todayMidnight;
    });

    const blockShifts = todayShifts.filter((shift) => {
      const worker = staff.find((s) => s.id === shift.staff_id);
      if (!worker) return false;
      return getShiftType(shift.start_time, worker.role) === key;
    });

    /* -------- LICENSED STAFF GROUPING -------- */
    const licensed = {
      "A Wing": { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
      "B Wing": { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
      Middle: { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 },
    };

    /* -------- CNA GROUPS -------- */
    const cnaGroups = {
      1: { count: 0, hours: 0 },
      2: { count: 0, hours: 0 },
      3: { count: 0, hours: 0 },
      4: { count: 0, hours: 0 },
      5: { count: 0, hours: 0 },
    };

    blockShifts.forEach((shift) => {
      const worker = staff.find((s) => s.id === shift.staff_id);
      if (!worker) return;

      const hours = calcHours(shift.start_time, shift.end_time);

      if (worker.role === "RN" || worker.role === "LPN") {
        if (licensed[shift.unit]) {
          const unit = licensed[shift.unit];

          if (worker.role === "RN") {
            unit.RN++;
            unit.hoursRN += hours;
          } else {
            unit.LPN++;
            unit.hoursLPN += hours;
          }
        }
      }

      if (worker.role === "CNA") {
        const grp = cnaGroups[shift.assignment_number];
        if (grp) {
          grp.count++;
          grp.hours += hours;
        }
      }
    });

    return (
      <div
        key={key}
        className={`glass-card ${currentShiftKey === key ? "active" : ""}`}
        style={{
          padding: "28px",
          minHeight: "240px",
          borderRadius: "10px",
          background: "rgba(255,255,255,0.08)",
          backdropFilter: "blur(6px)",
        }}
      >
        <h2 style={{ marginTop: 0 }}>{label}</h2>

        <h3 style={{ marginBottom: "8px" }}>Licensed Staff</h3>
        {Object.entries(licensed).map(([unit, data]) => {
          const lines = [];
          if (data.RN > 0)
            lines.push(`RN ${unit}: ${data.RN} | ${data.hoursRN.toFixed(1)}h`);
          if (data.LPN > 0)
            lines.push(`LPN ${unit}: ${data.LPN} | ${data.hoursLPN.toFixed(1)}h`);

          return (
            lines.length > 0 && (
              <div key={unit} style={{ marginBottom: "4px" }}>
                {lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )
          );
        })}

        <h3 style={{ marginTop: "16px" }}>CNAs</h3>
        {Object.entries(cnaGroups)
          .filter(([_, g]) => g.count > 0)
          .map(([num, g]) => (
            <div key={num}>
              CNA {num}: {g.count} | {g.hours.toFixed(1)}h
            </div>
          ))}

        {blockShifts.length === 0 && (
          <div style={{ marginTop: "10px", opacity: 0.8 }}>
            No staff scheduled today.
          </div>
        )}
      </div>
    );
  };

  /* -----------------------------------------------------------
     PAGE RENDER
  ------------------------------------------------------------ */
  if (loading) {
    return (
      <div style={{ padding: 40, color: "white" }}>
        Loading Dashboard...
      </div>
    );
  }

  return (
    <div style={{ padding: "32px", color: "white" }}>
      {/* ⭐ BIG CENTERED LOGO ⭐ */}
      <div style={{ textAlign: "center", marginBottom: "24px" }}>
        {orgLogo && (
          <img
            src={orgLogo}
            alt="Facility Logo"
            style={{
              height: "160px",
              maxWidth: "100%",
              objectFit: "contain",
            }}
          />
        )}
      </div>

      {/* CURRENT TIME */}
      <div
        style={{
          opacity: 0.9,
          marginBottom: "16px",
          fontSize: "18px",
          textAlign: "center",
        }}
      >
        Current Time: {currentTime.toLocaleString()}
      </div>

      {/* SHIFT BLOCKS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "24px",
          marginTop: "24px",
        }}
      >
        {SHIFT_BLOCKS.map(renderShiftCard)}
      </div>
    </div>
  );
}
