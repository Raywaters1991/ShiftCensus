// src/pages/DashboardPage.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import api from "../services/api";
import { useUser } from "../contexts/UserContext";

const SHIFT_BLOCKS = [
  { key: "Day", label: "Day Shift" },
  { key: "Evening", label: "Evening Shift" },
  { key: "Night", label: "Night Shift" },
];

function parseTS(value) {
  if (!value) return null;
  let iso = value;

  if (typeof iso === "string" && iso.includes(" ") && !iso.includes("T")) {
    iso = iso.replace(" ", "T");
  }

  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function normStatus(s) {
  const v = String(s || "empty").toLowerCase().trim();
  return v === "occupied" || v === "leave" || v === "empty" ? v : "empty";
}

export default function DashboardPage() {
  const { orgLogo, orgCode } = useUser();

  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [bedBoard, setBedBoard] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const refreshRef = useRef(null);
  const clockRef = useRef(null);

  useEffect(() => {
    // Clock tick (always)
    if (clockRef.current) clearInterval(clockRef.current);
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
      clockRef.current = null;
    };
  }, []);

  useEffect(() => {
    // ✅ Critical fix: do not load until orgCode is available
    if (!orgCode) return;

    // ✅ Ensure api.js can read org context from storage (safe fallback)
    try {
      localStorage.setItem("org_code", orgCode);
      localStorage.setItem("active_org_code", orgCode);
    } catch (e) {
      // ignore
    }

    // Initial load
    loadData(orgCode);

    // Refresh every 5s (clear old interval first)
    if (refreshRef.current) clearInterval(refreshRef.current);
    refreshRef.current = setInterval(() => loadData(orgCode), 5000);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
      refreshRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgCode]);

  async function loadData(code) {
    // guard (in case timer fires after org changes)
    if (!code) return;

    setLoadError("");
    try {
      const [shiftRes, staffRes, bedBoardRes] = await Promise.all([
        api.get("/shifts"),
        api.get("/staff"),
        api.get("/census/bed-board"),
      ]);

      const normalizedShifts = (shiftRes || []).map((s) => ({
        ...s,
        start_time: parseTS(s.start_time),
        end_time: parseTS(s.end_time),
      }));

      setShifts(normalizedShifts);
      setStaff(Array.isArray(staffRes) ? staffRes : []);
      setBedBoard(Array.isArray(bedBoardRes) ? bedBoardRes : []);
    } catch (err) {
      console.error("Dashboard load error:", err);
      setLoadError(err?.message || "Failed to load dashboard data.");
      // Keep prior data so the page doesn't go blank
    } finally {
      setLoading(false);
    }
  }

  const censusStats = useMemo(() => {
    const list = Array.isArray(bedBoard) ? bedBoard : [];
    const total = list.length;
    const occupied = list.filter((b) => normStatus(b.status) === "occupied").length;
    const leave = list.filter((b) => normStatus(b.status) === "leave").length;
    const empty = total - occupied - leave;
    return { total, occupied, leave, empty };
  }, [bedBoard]);

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

    blockShifts.forEach((shift) => {
      const worker = staff.find((s) => s.id === shift.staff_id);
      if (!worker) return;

      const hours = calcHours(shift.start_time, shift.end_time);

      if ((worker.role === "RN" || worker.role === "LPN") && licensed[shift.unit]) {
        const unit = licensed[shift.unit];
        if (worker.role === "RN") {
          unit.RN++;
          unit.hoursRN += hours;
        } else {
          unit.LPN++;
          unit.hoursLPN += hours;
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
          borderRadius: "14px",
          background: "var(--card-bg, rgba(255,255,255,0.08))",
          border: "1px solid var(--border)",
          color: "var(--text)",
        }}
      >
        <h2 style={{ marginTop: 0, color: "var(--text)" }}>{label}</h2>

        <h3 style={{ marginBottom: "8px", color: "var(--text)" }}>Licensed Staff</h3>
        {Object.entries(licensed).map(([unit, data]) => {
          const lines = [];
          if (data.RN > 0) lines.push(`RN ${unit}: ${data.RN} | ${data.hoursRN.toFixed(1)}h`);
          if (data.LPN > 0) lines.push(`LPN ${unit}: ${data.LPN} | ${data.hoursLPN.toFixed(1)}h`);

          return (
            lines.length > 0 && (
              <div key={unit} style={{ marginBottom: "4px", color: "var(--text)" }}>
                {lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            )
          );
        })}

        <h3 style={{ marginTop: "16px", color: "var(--text)" }}>CNAs</h3>
        {Object.entries(cnaGroups)
          .filter(([_, g]) => g.count > 0)
          .map(([num, g]) => (
            <div key={num} style={{ color: "var(--text)" }}>
              CNA {num}: {g.count} | {g.hours.toFixed(1)}h
            </div>
          ))}

        {blockShifts.length === 0 && (
          <div style={{ marginTop: "10px", opacity: 0.85, color: "var(--muted, var(--text))" }}>
            No staff scheduled today.
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return <div style={{ padding: 40, color: "var(--text)" }}>Loading Dashboard...</div>;
  }

  return (
    <div style={{ padding: "32px", color: "var(--text)" }}>
      <div style={{ textAlign: "center", marginBottom: "18px" }}>
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

      <div
        style={{
          opacity: 0.9,
          marginBottom: "10px",
          fontSize: "16px",
          textAlign: "center",
          color: "var(--text)",
        }}
      >
        Current Time: {currentTime.toLocaleString()}
      </div>

      {loadError ? (
        <div
          style={{
            maxWidth: 900,
            margin: "0 auto 14px",
            padding: 12,
            borderRadius: 12,
            border: "1px solid rgba(239,68,68,0.35)",
            background: "rgba(239,68,68,0.10)",
            color: "var(--text)",
            textAlign: "center",
            fontWeight: 800,
          }}
        >
          {loadError}
        </div>
      ) : null}

      {/* ✅ Census counters (all statuses) */}
      <div style={{ textAlign: "center", margin: "8px 0 18px" }}>
        <div style={{ fontSize: 12, opacity: 0.75, color: "var(--muted, var(--text))" }}>Census</div>
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 10,
          }}
        >
          <div style={chipStyle("rgba(34,211,238,0.14)", "rgba(34,211,238,0.45)")}>
            <div style={chipLabel}>Occupied</div>
            <div style={chipValue}>{censusStats.occupied}</div>
          </div>

          <div style={chipStyle("rgba(251,191,36,0.14)", "rgba(251,191,36,0.45)")}>
            <div style={chipLabel}>Leave</div>
            <div style={chipValue}>{censusStats.leave}</div>
          </div>

          <div style={chipStyle("rgba(156,163,175,0.12)", "rgba(156,163,175,0.40)")}>
            <div style={chipLabel}>Empty</div>
            <div style={chipValue}>{censusStats.empty}</div>
          </div>

          <div style={chipStyle("rgba(255,255,255,0.10)", "rgba(255,255,255,0.18)")}>
            <div style={chipLabel}>Total</div>
            <div style={chipValue}>{censusStats.total}</div>
          </div>
        </div>
      </div>

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

const chipStyle = (bg, border) => ({
  padding: "12px 14px",
  borderRadius: 14,
  background: bg,
  border: `1px solid ${border}`,
  minWidth: 150,
});

const chipLabel = {
  fontSize: 11,
  fontWeight: 900,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  opacity: 0.85,
};

const chipValue = {
  fontSize: 28,
  fontWeight: 1000,
  letterSpacing: "-0.03em",
  marginTop: 6,
};
