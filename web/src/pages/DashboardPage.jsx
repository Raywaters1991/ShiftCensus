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

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function findStaffById(staffList, staffId) {
  const sid = String(staffId ?? "");
  return (staffList || []).find((s) => String(s?.id ?? "") === sid) || null;
}

function inferShiftTypeFromStartLocal(startLocal, role) {
  const r = String(role || "").toUpperCase();
  const t = String(startLocal || "").slice(0, 5); // "HH:MM"

  // Common template anchors
  if (t === "06:00") return "Day";
  if (t === "14:00") return "Evening";
  if (t === "18:00") return "Night";

  const hour = Number(t.split(":")[0]);
  if (!Number.isFinite(hour)) return "Unknown";

  // Licensed often Day/Night only
  if (r === "RN" || r === "LPN") return hour >= 6 && hour < 18 ? "Day" : "Night";

  if (hour >= 6 && hour < 14) return "Day";
  if (hour >= 14 && hour < 22) return "Evening";
  return "Night";
}

function normalizeUnitName(u) {
  const v = String(u || "").trim();
  return v || "Unassigned";
}

export default function DashboardPage() {
  const { orgLogo, orgCode } = useUser();

  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [units, setUnits] = useState([]);
  const [bedBoard, setBedBoard] = useState([]);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const refreshRef = useRef(null);
  const clockRef = useRef(null);

  useEffect(() => {
    if (clockRef.current) clearInterval(clockRef.current);
    clockRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      if (clockRef.current) clearInterval(clockRef.current);
      clockRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!orgCode) return;

    try {
      localStorage.setItem("org_code", orgCode);
      localStorage.setItem("active_org_code", orgCode);
    } catch {}

    loadData(orgCode);

    if (refreshRef.current) clearInterval(refreshRef.current);
    refreshRef.current = setInterval(() => loadData(orgCode), 5000);

    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current);
      refreshRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgCode]);

  async function loadData(code) {
    if (!code) return;

    setLoadError("");
    try {
      const [shiftRes, staffRes, unitRes, bedBoardRes] = await Promise.all([
        api.get("/shifts"),
        api.get("/staff"),
        api.get("/units"),
        api.get("/census/bed-board"),
      ]);

      const normalizedShifts = (shiftRes || []).map((s) => ({
        ...s,
        start_time: parseTS(s.start_time),
        end_time: parseTS(s.end_time),
        unit: normalizeUnitName(s.unit),
      }));

      setShifts(normalizedShifts);
      setStaff(Array.isArray(staffRes) ? staffRes : []);
      setUnits(Array.isArray(unitRes) ? unitRes : []);
      setBedBoard(Array.isArray(bedBoardRes) ? bedBoardRes : []);
    } catch (err) {
      console.error("Dashboard load error:", err);
      setLoadError(err?.message || "Failed to load dashboard data.");
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

  const calcHours = (start, end) => {
    if (!start || !end) return 0;
    return Math.max((end - start) / 3600000, 0);
  };

  const todayKey = useMemo(() => todayISO(), [currentTime]);

  const currentShiftKey = (() => {
    const h = currentTime.getHours();
    if (h >= 6 && h < 14) return "Day";
    if (h >= 14 && h < 22) return "Evening";
    return "Night";
  })();

  function buildLicensedBucketsFromUnits() {
    // Units can be returned in many shapes; try a few common fields.
    const names = (Array.isArray(units) ? units : [])
      .map((u) => u?.name || u?.unit || u?.label || u?.code || "")
      .map((x) => String(x).trim())
      .filter(Boolean);

    // Ensure we always have at least one bucket to show data
    const unique = Array.from(new Set(names));
    const buckets = {};

    unique.forEach((n) => {
      buckets[n] = { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 };
    });

    // Always include a catch-all bucket
    buckets["Unassigned"] = buckets["Unassigned"] || { RN: 0, LPN: 0, hoursRN: 0, hoursLPN: 0 };

    return buckets;
  }

  const renderShiftCard = ({ key, label }) => {
    if (!Array.isArray(shifts) || !Array.isArray(staff)) return null;

    // ✅ FIX: filter by shift_date (facility day) not by start_time (UTC skew)
    const todayShifts = shifts.filter((shift) => String(shift.shift_date || "") === todayKey);

    const blockShifts = todayShifts.filter((shift) => {
      const worker = findStaffById(staff, shift.staff_id);
      if (!worker) return false;

      const shiftType =
        shift.shift_type ||
        shift.shiftType ||
        inferShiftTypeFromStartLocal(shift.start_local, worker.role);

      return shiftType === key;
    });

    // ✅ dynamic units
    const licensed = buildLicensedBucketsFromUnits();

    // CNA assignment groups (kept)
    const cnaGroups = {
      1: { count: 0, hours: 0 },
      2: { count: 0, hours: 0 },
      3: { count: 0, hours: 0 },
      4: { count: 0, hours: 0 },
      5: { count: 0, hours: 0 },
    };

    blockShifts.forEach((shift) => {
      const worker = findStaffById(staff, shift.staff_id);
      if (!worker) return;

      const workerRole = String(worker.role || "").toUpperCase();
      const unitName = normalizeUnitName(shift.unit);
      const hours = calcHours(shift.start_time, shift.end_time);

      if (workerRole === "RN" || workerRole === "LPN") {
        const bucket = licensed[unitName] || licensed["Unassigned"];
        if (workerRole === "RN") {
          bucket.RN++;
          bucket.hoursRN += hours;
        } else {
          bucket.LPN++;
          bucket.hoursLPN += hours;
        }
      }

      if (workerRole === "CNA") {
        const grp = cnaGroups[shift.assignment_number];
        if (grp) {
          grp.count++;
          grp.hours += hours;
        }
      }
    });

    const hasLicensedLines = Object.values(licensed).some(
      (u) => u.RN > 0 || u.LPN > 0
    );

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

        {hasLicensedLines ? (
          Object.entries(licensed).map(([unit, data]) => {
            const lines = [];
            if (data.RN > 0) lines.push(`RN ${unit}: ${data.RN} | ${data.hoursRN.toFixed(1)}h`);
            if (data.LPN > 0) lines.push(`LPN ${unit}: ${data.LPN} | ${data.hoursLPN.toFixed(1)}h`);

            if (lines.length === 0) return null;

            return (
              <div key={unit} style={{ marginBottom: "6px" }}>
                {lines.map((l, i) => (
                  <div key={i}>{l}</div>
                ))}
              </div>
            );
          })
        ) : (
          <div style={{ opacity: 0.85 }}>No licensed staff scheduled.</div>
        )}

        <h3 style={{ marginTop: "16px", color: "var(--text)" }}>CNAs</h3>
        {Object.entries(cnaGroups)
          .filter(([_, g]) => g.count > 0)
          .map(([num, g]) => (
            <div key={num}>
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
            style={{ height: "160px", maxWidth: "100%", objectFit: "contain" }}
          />
        )}
      </div>

      <div style={{ opacity: 0.9, marginBottom: "10px", fontSize: "16px", textAlign: "center" }}>
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
            textAlign: "center",
            fontWeight: 800,
          }}
        >
          {loadError}
        </div>
      ) : null}

      <div style={{ textAlign: "center", margin: "8px 0 18px" }}>
        <div style={{ fontSize: 12, opacity: 0.75 }}>Census</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", marginTop: 10 }}>
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

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "24px", marginTop: "24px" }}>
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
