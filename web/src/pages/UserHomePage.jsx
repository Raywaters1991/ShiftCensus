

// web/src/pages/UserHomePage.jsx
import { useEffect, useMemo, useState } from "react";
import api from "../services/api";
import { useNavigate } from "react-router-dom";

const DOTS = {
  my: { label: "My Shifts", className: "dot dot-my" },
  open: { label: "Open Shifts", className: "dot dot-open" },
  pending: { label: "Pending", className: "dot dot-pending" },
  timeoff: { label: "Time Off Approved", className: "dot dot-timeoff" },
};

function ymd(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function monthKey(dateObj) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function startOfMonth(dateObj) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
}

function endOfMonth(dateObj) {
  return new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);
}

function buildCalendarDays(monthDate) {
  const start = startOfMonth(monthDate);
  const end = endOfMonth(monthDate);

  // Sun=0..Sat=6
  const startDow = start.getDay();
  const days = [];

  // pad before month
  for (let i = 0; i < startDow; i++) days.push(null);

  // month days
  for (let d = 1; d <= end.getDate(); d++) {
    days.push(new Date(monthDate.getFullYear(), monthDate.getMonth(), d));
  }

  // pad to full 6 rows (42 cells) for stable UI
  while (days.length < 42) days.push(null);

  return days;
}

function formatShiftLine(s) {
  const date = s?.date || s?.shift_date || s?.start_date || null;
  const start = s?.start_local || s?.start || s?.start_time || "";
  const end = s?.end_local || s?.end || s?.end_time || "";
  const unit = s?.unit_name || s?.unit || "";
  const role = s?.role || "";
  const labelParts = [
    date ? ymd(date) : "",
    start && end ? `${start}-${end}` : "",
    role ? role : "",
    unit ? unit : "",
  ].filter(Boolean);

  return labelParts.join(" • ");
}

export default function UserHomePage() {
  const nav = useNavigate();

  const [monthDate, setMonthDate] = useState(() => new Date());
  const [loading, setLoading] = useState(false);

  const [myShifts, setMyShifts] = useState([]);
  const [openShifts, setOpenShifts] = useState([]);
  const [pending, setPending] = useState([]);
  const [timeOff, setTimeOff] = useState([]);

  const [activePanel, setActivePanel] = useState("schedule"); // schedule | open | mine | notifications | profile
  const [selectedShift, setSelectedShift] = useState(null);
  const [actionBusy, setActionBusy] = useState(false);

  const key = useMemo(() => monthKey(monthDate), [monthDate]);

  const dayDots = useMemo(() => {
    // map YYYY-MM-DD -> Set(dotTypes)
    const map = new Map();

    function addDot(dateVal, dotType) {
      if (!dateVal) return;
      const k = ymd(dateVal);
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(dotType);
    }

    (myShifts || []).forEach((s) => addDot(s.date || s.shift_date || s.start_date, "my"));
    (openShifts || []).forEach((s) => addDot(s.date || s.shift_date || s.start_date, "open"));
    (pending || []).forEach((p) => addDot(p.date || p.shift_date || p.start_date, "pending"));
    (timeOff || []).forEach((t) => {
      // if timeoff has ranges, support start/end
      if (t?.start_date && t?.end_date) {
        const a = new Date(t.start_date);
        const b = new Date(t.end_date);
        for (let d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) addDot(d, "timeoff");
      } else {
        addDot(t.date || t.start_date, "timeoff");
      }
    });

    return map;
  }, [myShifts, openShifts, pending, timeOff]);

  async function loadMonth() {
    setLoading(true);
    setSelectedShift(null);
    try {
      // Preferred one-shot endpoint
      const res = await api.get(`/me/home-summary?month=${key}`);

      // NOTE: your api.js returns response.data? If not, adjust here.
      const data = res;

      setMyShifts(Array.isArray(data?.myShifts) ? data.myShifts : []);
      setOpenShifts(Array.isArray(data?.openShifts) ? data.openShifts : []);
      setPending(Array.isArray(data?.pending) ? data.pending : []);
      setTimeOff(Array.isArray(data?.timeOff) ? data.timeOff : []);
    } catch (e) {
      console.error("HOME LOAD ERROR:", e);
      // Fail soft
      setMyShifts([]);
      setOpenShifts([]);
      setPending([]);
      setTimeOff([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadMonth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const days = useMemo(() => buildCalendarDays(monthDate), [monthDate]);
  const title = useMemo(() => {
    const fmt = monthDate.toLocaleString(undefined, { month: "long", year: "numeric" });
    return fmt;
  }, [monthDate]);

  function prevMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setMonthDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  async function requestPickup(shift) {
    if (!shift?.id) return;
    setActionBusy(true);
    try {
      await api.post("/shift-requests/pickup", { shift_id: shift.id });
      alert("Pickup request submitted.");
      await loadMonth();
      setSelectedShift(null);
    } catch (e) {
      alert(e?.message || "Failed to request pickup.");
    } finally {
      setActionBusy(false);
    }
  }

  async function requestTimeOff(shift) {
    if (!shift?.id) return;
    const reason = window.prompt("Reason (optional):") || "";
    setActionBusy(true);
    try {
      await api.post("/shift-requests/time-off", { shift_id: shift.id, reason: reason || null });
      alert("Time-off request submitted.");
      await loadMonth();
      setSelectedShift(null);
    } catch (e) {
      alert(e?.message || "Failed to request time off.");
    } finally {
      setActionBusy(false);
    }
  }

  async function offerShift(shift) {
    if (!shift?.id) return;
    const note = window.prompt("Note (optional):") || "";
    setActionBusy(true);
    try {
      await api.post("/shift-requests/offer", { shift_id: shift.id, note: note || null });
      alert("Shift offer submitted.");
      await loadMonth();
      setSelectedShift(null);
    } catch (e) {
      alert(e?.message || "Failed to offer shift.");
    } finally {
      setActionBusy(false);
    }
  }

  function logout() {
    // if you’re using Supabase client auth elsewhere, call supabase.auth.signOut()
    // For now: nuke auth token + org context and reload
    try {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("sb-") && k.endsWith("-auth-token")) localStorage.removeItem(k);
      });
      sessionStorage.clear();
    } catch {}
    window.location.href = "/login";
  }

  return (
    <div style={ui.page}>
      <div style={ui.header}>
        <div style={{ minWidth: 0 }}>
          <div style={ui.h1}>Home</div>
          <div style={ui.sub}>
            {loading ? "Loading…" : "Schedule • Shifts • Notifications"}
          </div>
        </div>

        <button style={ui.btnGhost} onClick={loadMonth} disabled={loading}>
          Refresh
        </button>
      </div>

      {/* ICON GRID */}
      <div style={ui.iconGrid}>
        <IconTile label="Schedule" emoji="📅" onClick={() => setActivePanel("schedule")} active={activePanel === "schedule"} />
        <IconTile label="Open Shifts" emoji="🟦" onClick={() => setActivePanel("open")} active={activePanel === "open"} />
        <IconTile label="My Shifts" emoji="✅" onClick={() => setActivePanel("mine")} active={activePanel === "mine"} />
        <IconTile label="Notifications" emoji="🔔" onClick={() => setActivePanel("notifications")} active={activePanel === "notifications"} />
        <IconTile label="Profile" emoji="👤" onClick={() => setActivePanel("profile")} active={activePanel === "profile"} />
        <IconTile label="Logout" emoji="🚪" onClick={logout} danger />
      </div>

      {/* PANELS */}
      {activePanel === "schedule" ? (
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div>
              <div style={ui.cardTitle}>{title}</div>
              <div style={ui.cardSub}>
                Dots: <Legend />
              </div>
            </div>

            <div style={{ display: "flex", gap: 10 }}>
              <button style={ui.btnGhost} onClick={prevMonth}>←</button>
              <button style={ui.btnGhost} onClick={nextMonth}>→</button>
            </div>
          </div>

          <div style={ui.calendarHead}>
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d) => (
              <div key={d} style={ui.calDow}>{d}</div>
            ))}
          </div>

          <div style={ui.calendarGrid}>
            {days.map((d, idx) => {
              if (!d) return <div key={idx} style={ui.calCellEmpty} />;
              const k = ymd(d);
              const dots = dayDots.get(k) ? Array.from(dayDots.get(k)) : [];
              const isToday = ymd(new Date()) === k;

              return (
                <div key={k} style={ui.calCell(isToday)}>
                  <div style={ui.calDayNum}>{d.getDate()}</div>
                  <div style={ui.dotRow}>
                    {dots.slice(0, 4).map((t) => (
                      <span key={t} className={DOTS[t]?.className} title={DOTS[t]?.label} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {activePanel === "open" ? (
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div>
              <div style={ui.cardTitle}>Open Shifts</div>
              <div style={ui.cardSub}>Tap a shift to request pickup.</div>
            </div>
          </div>

          {openShifts.length === 0 ? (
            <div style={ui.empty}>No open shifts this month.</div>
          ) : (
            <div style={ui.list}>
              {openShifts.map((s) => (
                <button key={s.id} style={ui.listRow} onClick={() => setSelectedShift({ ...s, _type: "open" })}>
                  <div style={ui.rowTitle}>{formatShiftLine(s)}</div>
                  <div style={ui.rowSub}>Tap to request pickup</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activePanel === "mine" ? (
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div>
              <div style={ui.cardTitle}>My Shifts</div>
              <div style={ui.cardSub}>Tap a shift to request time off or offer it.</div>
            </div>
          </div>

          {myShifts.length === 0 ? (
            <div style={ui.empty}>No shifts scheduled this month.</div>
          ) : (
            <div style={ui.list}>
              {myShifts.map((s) => (
                <button key={s.id} style={ui.listRow} onClick={() => setSelectedShift({ ...s, _type: "mine" })}>
                  <div style={ui.rowTitle}>{formatShiftLine(s)}</div>
                  <div style={ui.rowSub}>Tap for options</div>
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {activePanel === "notifications" ? (
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div>
              <div style={ui.cardTitle}>Notifications</div>
              <div style={ui.cardSub}>This is where shift requests + approvals will appear.</div>
            </div>
          </div>

          <div style={ui.empty}>
            Wire: <code>GET /notifications</code> and we’ll render them here (read/unread, deep links).
          </div>
        </div>
      ) : null}

      {activePanel === "profile" ? (
        <div style={ui.card}>
          <div style={ui.cardHeader}>
            <div>
              <div style={ui.cardTitle}>Profile</div>
              <div style={ui.cardSub}>Edit your name, phone, preferred units, etc.</div>
            </div>
          </div>

          <div style={ui.empty}>
            Wire: <code>GET/PUT /me</code> and we’ll build the editor (and avatar later if you want).
          </div>
        </div>
      ) : null}

      {/* SHIFT ACTION MODAL */}
      {selectedShift ? (
        <div style={ui.overlay} onMouseDown={() => setSelectedShift(null)}>
          <div style={ui.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={ui.modalTitle}>
              {selectedShift._type === "open" ? "Open Shift" : "My Shift"}
            </div>
            <div style={ui.modalBody}>{formatShiftLine(selectedShift)}</div>

            <div style={ui.modalActions}>
              <button style={ui.btnGhost} onClick={() => setSelectedShift(null)} disabled={actionBusy}>
                Close
              </button>

              {selectedShift._type === "open" ? (
                <button style={ui.btnPrimary} onClick={() => requestPickup(selectedShift)} disabled={actionBusy}>
                  {actionBusy ? "Working…" : "Request Pickup"}
                </button>
              ) : (
                <>
                  <button style={ui.btnGhost} onClick={() => offerShift(selectedShift)} disabled={actionBusy}>
                    {actionBusy ? "Working…" : "Offer Shift"}
                  </button>
                  <button style={ui.btnPrimary} onClick={() => requestTimeOff(selectedShift)} disabled={actionBusy}>
                    {actionBusy ? "Working…" : "Request Time Off"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* minimal dot styles */}
      <style>{`
        .dot{ display:inline-block; width:10px; height:10px; border-radius:999px; margin-right:6px; }
        .dot-my{ background:#22c55e; }       /* green */
        .dot-open{ background:#3b82f6; }     /* blue */
        .dot-pending{ background:#f59e0b; }  /* amber */
        .dot-timeoff{ background:#a855f7; }  /* purple */
      `}</style>
    </div>
  );
}

function IconTile({ label, emoji, onClick, active, danger }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...ui.iconTile,
        borderColor: danger ? "rgba(239,68,68,0.35)" : active ? "rgba(255,255,255,0.22)" : "rgba(255,255,255,0.10)",
        background: danger ? "rgba(239,68,68,0.10)" : active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.05)",
      }}
      type="button"
    >
      <div style={{ fontSize: 26 }}>{emoji}</div>
      <div style={{ fontWeight: 900 }}>{label}</div>
    </button>
  );
}

function Legend() {
  return (
    <span style={{ display: "inline-flex", gap: 10, flexWrap: "wrap", marginLeft: 6 }}>
      {Object.entries(DOTS).map(([k, v]) => (
        <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span className={v.className} />
          <span style={{ fontSize: 12, color: "#9CA3AF" }}>{v.label}</span>
        </span>
      ))}
    </span>
  );
}

const ui = {
  page: { padding: 18, color: "white", minHeight: "100vh" },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.28)",
    boxShadow: "0 18px 70px rgba(0,0,0,0.45)",
    marginBottom: 14,
  },

  h1: { fontSize: 18, fontWeight: 1000 },
  sub: { color: "#9CA3AF", fontSize: 12, marginTop: 4 },

  iconGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 12,
    marginBottom: 14,
  },

  iconTile: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.10)",
    padding: 14,
    color: "white",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 12,
    justifyContent: "flex-start",
  },

  card: {
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(0,0,0,0.28)",
    boxShadow: "0 18px 70px rgba(0,0,0,0.45)",
    padding: 14,
    overflow: "hidden",
  },

  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12,
  },

  cardTitle: { fontSize: 15, fontWeight: 1000 },
  cardSub: { marginTop: 4, color: "#9CA3AF", fontSize: 12, lineHeight: 1.35 },

  btnPrimary: {
    height: 40,
    borderRadius: 14,
    padding: "10px 14px",
    background: "white",
    color: "#0b0b0b",
    border: "none",
    cursor: "pointer",
    fontWeight: 950,
  },

  btnGhost: {
    height: 40,
    borderRadius: 14,
    padding: "10px 14px",
    background: "rgba(255,255,255,0.06)",
    color: "white",
    border: "1px solid rgba(255,255,255,0.12)",
    cursor: "pointer",
    fontWeight: 900,
  },

  calendarHead: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 8,
    marginBottom: 8,
  },

  calDow: { color: "#9CA3AF", fontSize: 12, fontWeight: 900, textAlign: "center" },

  calendarGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(7, 1fr)",
    gap: 8,
  },

  calCell: (isToday) => ({
    minHeight: 64,
    borderRadius: 14,
    border: isToday ? "1px solid rgba(255,255,255,0.22)" : "1px solid rgba(255,255,255,0.10)",
    background: isToday ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.04)",
    padding: 10,
  }),

  calCellEmpty: {
    minHeight: 64,
    borderRadius: 14,
    border: "1px dashed rgba(255,255,255,0.06)",
    background: "rgba(0,0,0,0.12)",
  },

  calDayNum: { fontWeight: 1000, fontSize: 13, marginBottom: 8 },
  dotRow: { display: "flex", alignItems: "center", gap: 0, flexWrap: "wrap" },

  list: { display: "grid", gap: 10 },
  listRow: {
    width: "100%",
    textAlign: "left",
    borderRadius: 16,
    padding: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.04)",
    cursor: "pointer",
  },
  rowTitle: { color: "white", fontWeight: 950, fontSize: 14 },
  rowSub: { color: "#9CA3AF", fontSize: 12, marginTop: 4 },

  empty: { color: "#9CA3AF", padding: 14, textAlign: "center" },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    zIndex: 9999,
  },
  modal: {
    width: "min(720px, 100%)",
    borderRadius: 18,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.9)",
    boxShadow: "0 30px 120px rgba(0,0,0,0.75)",
    padding: 16,
  },
  modalTitle: { color: "white", fontWeight: 1000, fontSize: 18 },
  modalBody: { color: "#E5E7EB", marginTop: 10, lineHeight: 1.5 },
  modalActions: { display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 14, flexWrap: "wrap" },
};
