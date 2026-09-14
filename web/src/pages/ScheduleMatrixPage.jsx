import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useUser } from "../contexts/UserContext.jsx";

const SHIFT_TYPES = ["Day", "Evening", "Night"];
const ROLE_OPTIONS = ["All Staff", "Nurses (RN/LPN)", "RN", "LPN", "CNA"];

const pad = (n) => String(n).padStart(2, "0");
const ymd = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
function startOfWeek(date) { const d = new Date(date); const day = d.getDay(); d.setHours(0,0,0,0); d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)); return d; }
function addDays(date, amount) { const d = new Date(date); d.setDate(d.getDate() + amount); return d; }
function shiftHours(shift) { if (!shift?.start_time || !shift?.end_time) return 0; return Math.max(0, (new Date(shift.end_time) - new Date(shift.start_time)) / 3600000); }
function isNurse(role) { return ["RN", "LPN", "NURSE"].includes(String(role || "").toUpperCase()); }
function roleGroup(role) { if (isNurse(role)) return "Nurse"; if (String(role || "").toUpperCase() === "CNA") return "CNA"; return String(role || ""); }
function formatTime(value) { if (!value) return ""; const [h,m] = String(value).slice(0,5).split(":").map(Number); const suffix = h >= 12 ? "p" : "a"; const hour = h % 12 || 12; return `${hour}${m ? `:${pad(m)}` : ""}${suffix}`; }

export default function ScheduleMatrixPage() {
  const navigate = useNavigate();
  const { permissions, isSuperadmin, role } = useUser();
  const canWrite = !!isSuperadmin || String(role || "").toLowerCase() === "superadmin" || !!permissions?.can_schedule_write;
  const canAdmin = !!isSuperadmin || !!permissions?.is_admin;

  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [rangeDays, setRangeDays] = useState(7);
  const [shifts, setShifts] = useState([]);
  const [staff, setStaff] = useState([]);
  const [pto, setPto] = useState([]);
  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleFilter, setRoleFilter] = useState("Nurses (RN/LPN)");
  const [shiftFilter, setShiftFilter] = useState("All Shifts");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);
  const [saving, setSaving] = useState(false);

  const days = useMemo(() => Array.from({ length: rangeDays }, (_, i) => addDays(week, i)), [week, rangeDays]);
  const from = ymd(days[0]);
  const to = ymd(days[days.length - 1]);

  async function load() {
    setLoading(true);
    try {
      const [shiftRows, staffRows, leaveRows, coverageRows] = await Promise.all([
        api.get(`/shifts?from=${from}&to=${to}`),
        api.get("/staff/lookup"),
        api.get(`/shift-requests/approved-time-off?from=${from}&to=${to}`),
        api.get("/coverage-requirements"),
      ]);
      setShifts(Array.isArray(shiftRows) ? shiftRows : []);
      setStaff(Array.isArray(staffRows) ? staffRows : []);
      setPto(Array.isArray(leaveRows) ? leaveRows : []);
      setRequirements(Array.isArray(coverageRows) ? coverageRows : []);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [from, to]);

  const staffById = useMemo(() => Object.fromEntries(staff.map((p) => [String(p.id), p])), [staff]);
  const rangeHours = useMemo(() => {
    const result = {};
    shifts.forEach((shift) => { if (shift.staff_id != null) result[shift.staff_id] = (result[shift.staff_id] || 0) + shiftHours(shift); });
    return result;
  }, [shifts]);
  const visibleStaff = useMemo(() => staff.filter((person) => {
    const r = String(person.role || "").toUpperCase();
    let roleMatches = roleFilter === "All Staff";
    if (roleFilter === "Nurses (RN/LPN)") roleMatches = isNurse(r);
    if (["RN","LPN","CNA"].includes(roleFilter)) roleMatches = r === roleFilter;
    return roleMatches && (!search || String(person.name || "").toLowerCase().includes(search.toLowerCase()));
  }).sort((a,b) => String(a.name || "").localeCompare(String(b.name || ""))), [staff, roleFilter, search]);
  const shiftMap = useMemo(() => { const out = {}; shifts.forEach((s) => { if (s.staff_id == null) return; const k = `${s.staff_id}|${s.shift_date}`; (out[k] ||= []).push(s); }); return out; }, [shifts]);
  const ptoMap = useMemo(() => { const out = {}; pto.forEach((r) => { const d = new Date(`${r.start_date}T00:00:00`), end = new Date(`${r.end_date}T00:00:00`); while (d <= end) { out[`${r.staff_id}|${ymd(d)}`] = r; d.setDate(d.getDate()+1); } }); return out; }, [pto]);
  const requirementMap = useMemo(() => Object.fromEntries(requirements.map((r) => [`${r.role_group}|${r.shift_type}`, Number(r.required_count) || 0])), [requirements]);
  const coverageConfigured = requirements.some((r) => Number(r.required_count) > 0);
  const coverage = useMemo(() => {
    const perDay = {}; let shortage = 0, coveredSlots = 0;
    days.forEach((day) => {
      const date = ymd(day); let dayShortage = 0;
      ["Nurse","CNA"].forEach((group) => SHIFT_TYPES.forEach((shiftType) => {
        const required = requirementMap[`${group}|${shiftType}`] || 0; if (!required) return;
        const scheduled = shifts.filter((s) => s.shift_date === date && s.staff_id != null && s.shift_type === shiftType && roleGroup(staffById[String(s.staff_id)]?.role || s.role) === group).length;
        if (scheduled >= required) coveredSlots += 1; else { const gap = required - scheduled; shortage += gap; dayShortage += gap; }
      }));
      perDay[date] = dayShortage;
    });
    return { shortage, coveredSlots, perDay };
  }, [days, requirementMap, shifts, staffById]);

  const openCount = shifts.filter((s) => s.staff_id == null).length;
  const overtimeCount = Object.values(rangeHours).filter((h) => h > (rangeDays === 14 ? 80 : 40)).length;
  const otThreshold = rangeDays === 14 ? 80 : 40;

  async function addShift() {
    const form = modal?.form; if (!form?.staff_id || !form.date || !form.shift_type) return;
    setSaving(true); try { await api.post("/shifts", { staff_id: Number(form.staff_id), shift_date: form.date, shiftType: form.shift_type }); setModal(null); await load(); }
    catch (e) { alert(e?.message || "Unable to add shift"); } finally { setSaving(false); }
  }
  async function addOpenShift() {
    const form = modal?.form; if (!form?.date || !form.role || !form.shift_type) return;
    setSaving(true); try { await api.post("/shifts/open", { role: form.role, shift_date: form.date, shiftType: form.shift_type }); setModal(null); await load(); }
    catch (e) { alert(e?.message || "Unable to add open shift"); } finally { setSaving(false); }
  }
  async function saveCoverageRules() {
    setSaving(true); try { await api.put("/coverage-requirements", { requirements: modal.rows }); setRequirements(modal.rows); setModal(null); }
    catch (e) { alert(e?.message || "Unable to save coverage rules"); } finally { setSaving(false); }
  }
  function updateCoverageRule(group, shiftType, value) {
    setModal((current) => { const rows = [...current.rows]; const i = rows.findIndex((r) => r.role_group === group && r.shift_type === shiftType); const next = { role_group: group, shift_type: shiftType, required_count: Number(value) || 0 }; if (i >= 0) rows[i] = { ...rows[i], ...next }; else rows.push(next); return { ...current, rows }; });
  }

  if (loading) return <div style={{ padding: 32 }}>Loading schedule…</div>;

  return <div style={styles.page}>
    <div style={styles.header}>
      <div><h1 style={{ margin: 0, fontSize: 38 }}>Schedule</h1><div style={styles.muted}>Build, manage, and review staffing by employee.</div></div>
      <div style={styles.toolbar}>
        <button style={styles.button} onClick={() => setWeek(startOfWeek(new Date()))}>Today</button>
        <button style={styles.button} onClick={() => setWeek(addDays(week, -rangeDays))}>‹</button>
        <button style={styles.button} onClick={() => setWeek(addDays(week, rangeDays))}>›</button>
        <b>{days[0].toLocaleDateString("en-US", { month: "long", day: "numeric" })} – {days[days.length-1].toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</b>
        <button style={rangeDays === 7 ? styles.activeButton : styles.button} onClick={() => setRangeDays(7)}>Week</button>
        <button style={rangeDays === 14 ? styles.activeButton : styles.button} onClick={() => setRangeDays(14)}>2 Weeks</button>
        <button style={styles.button} onClick={() => navigate("/shifts/month")}>Month</button>
      </div>
    </div>

    <div style={styles.filters}>
      <Select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>{ROLE_OPTIONS.map((o) => <option key={o}>{o}</option>)}</Select>
      <Select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value)}><option>All Shifts</option>{SHIFT_TYPES.map((o) => <option key={o}>{o}</option>)}</Select>
      <input style={{ ...styles.input, flex: 1 }} placeholder="Search employees…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {canWrite && <button style={styles.primaryButton} onClick={() => setModal({ type: "open", form: { role: "Nurse", date: from, shift_type: "Day" } })}>+ Open Shift</button>}
      {canAdmin && <button style={styles.button} onClick={() => setModal({ type: "rules", rows: requirements.map((r) => ({ ...r })) })}>Coverage Rules</button>}
      <button style={styles.button} onClick={() => window.print()}>Print</button>
    </div>

    <div style={styles.summaryGrid}>
      <SummaryCard title="Coverage" value={coverageConfigured ? (coverage.shortage ? `${coverage.shortage} short` : `${coverage.coveredSlots} covered`) : "Not configured"} tone={coverageConfigured ? (coverage.shortage ? "warn" : "ok") : "neutral"} />
      <SummaryCard title="Open Shifts" value={openCount} tone={openCount ? "info" : "neutral"} />
      <SummaryCard title="PTO / Leave" value={pto.length} tone="purple" />
      <SummaryCard title="Overtime Risk" value={overtimeCount} tone={overtimeCount ? "warn" : "neutral"} />
    </div>
    {!coverageConfigured && <div style={styles.notice}>Coverage rules are not configured yet. Set required Nurses and CNAs per shift to turn on automatic coverage status.</div>}

    <div style={styles.tableWrap}><table style={{ ...styles.table, minWidth: rangeDays === 14 ? 2050 : 1180 }}><thead><tr>
      <th style={styles.stickyHead}>Employee</th>
      {days.map((day) => { const date = ymd(day), short = coverage.perDay[date] || 0; return <th key={date} style={styles.dayHead}><div>{day.toLocaleDateString("en-US", { weekday: "short" })}</div><small>{day.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</small>{coverageConfigured && <div style={{ fontSize: 11, marginTop: 4, color: short ? "#f59e0b" : "#22c55e" }}>{short ? `⚠ ${short} short` : "✓ Covered"}</div>}</th>; })}
      <th style={styles.dayHead}>Total</th>
    </tr></thead><tbody>
      {visibleStaff.map((person) => <tr key={person.id}>
        <td style={styles.stickyCell}><b>{person.name}</b><div style={styles.smallMuted}>{person.role}</div></td>
        {days.map((day) => {
          const date = ymd(day), leave = ptoMap[`${person.id}|${date}`];
          const rows = (shiftMap[`${person.id}|${date}`] || []).filter((s) => shiftFilter === "All Shifts" || s.shift_type === shiftFilter);
          const empty = !leave && rows.length === 0;
          return <td key={date} style={{ ...styles.cell, ...(empty && canWrite ? styles.clickableCell : {}) }} onClick={() => empty && canWrite && setModal({ type: "shift", form: { staff_id: String(person.id), date, shift_type: "Day" } })}>
            {leave && <div style={styles.ptoBox}>✈ PTO</div>}
            {rows.map((shift) => <div key={shift.id} style={shift.shift_type === "Night" ? styles.nightBox : styles.shiftBox}><b>{String(shift.shift_type || "Shift").toUpperCase()}</b><small>{shift.start_local && shift.end_local ? `${formatTime(shift.start_local)}–${formatTime(shift.end_local)}` : ""}</small></div>)}
            {empty && <span style={styles.emptyHint}>{canWrite ? "+" : "—"}</span>}
          </td>;
        })}
        <td style={styles.totalCell}><div style={{ fontSize: 18, fontWeight: 900 }}>{Math.round((rangeHours[person.id] || 0) * 10) / 10}h</div>{(rangeHours[person.id] || 0) > otThreshold && <div style={styles.otBadge}>⚠ OT</div>}</td>
      </tr>)}
      {canWrite && <tr><td style={styles.stickyCell}><b>Open Coverage</b></td>{days.map((day) => { const date = ymd(day); const rows = shifts.filter((s) => s.staff_id == null && s.shift_date === date && (shiftFilter === "All Shifts" || s.shift_type === shiftFilter)); return <td key={date} style={styles.cell}>{rows.map((s) => <div key={s.id} style={styles.openBox}>+ OPEN<small>{roleGroup(s.role)} · {s.shift_type}</small></div>)}</td>; })}<td style={styles.cell}>—</td></tr>}
    </tbody></table></div>

    {modal && <Modal onClose={() => !saving && setModal(null)}>
      {modal.type === "shift" && <><h2>Add Shift</h2><label style={styles.label}>Employee<Select value={modal.form.staff_id} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, staff_id: e.target.value } }))}>{staff.map((p) => <option value={p.id} key={p.id}>{p.name} ({p.role})</option>)}</Select></label><label style={styles.label}>Date<input style={styles.input} type="date" value={modal.form.date} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, date: e.target.value } }))} /></label><label style={styles.label}>Shift<Select value={modal.form.shift_type} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, shift_type: e.target.value } }))}>{SHIFT_TYPES.map((o) => <option key={o}>{o}</option>)}</Select></label><button style={styles.primaryButton} disabled={saving} onClick={addShift}>{saving ? "Saving…" : "Add Shift"}</button></>}
      {modal.type === "open" && <><h2>Post Open Shift</h2><label style={styles.label}>Coverage<Select value={modal.form.role} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, role: e.target.value } }))}><option value="Nurse">Nurse (RN/LPN)</option><option value="CNA">CNA</option></Select></label><label style={styles.label}>Date<input style={styles.input} type="date" value={modal.form.date} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, date: e.target.value } }))} /></label><label style={styles.label}>Shift<Select value={modal.form.shift_type} onChange={(e) => setModal((m) => ({ ...m, form: { ...m.form, shift_type: e.target.value } }))}>{SHIFT_TYPES.map((o) => <option key={o}>{o}</option>)}</Select></label><button style={styles.primaryButton} disabled={saving} onClick={addOpenShift}>{saving ? "Posting…" : "Post Open Shift"}</button></>}
      {modal.type === "rules" && <><h2>Coverage Rules</h2><p style={styles.muted}>Required staff for each shift. These rules apply to every day of the week.</p>{["Nurse","CNA"].map((group) => <div key={group} style={{ marginBottom: 18 }}><b>{group}</b><div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 8 }}>{SHIFT_TYPES.map((shiftType) => { const existing = modal.rows.find((r) => r.role_group === group && r.shift_type === shiftType); return <label key={shiftType} style={styles.label}>{shiftType}<input style={styles.input} type="number" min="0" max="100" value={existing?.required_count || 0} onChange={(e) => updateCoverageRule(group, shiftType, e.target.value)} /></label>; })}</div></div>)}<button style={styles.primaryButton} disabled={saving} onClick={saveCoverageRules}>{saving ? "Saving…" : "Save Coverage Rules"}</button></>}
    </Modal>}
  </div>;
}

function Select({ children, style, ...props }) { return <div style={{ ...styles.selectWrap, ...style }}><select style={styles.select} {...props}>{children}</select><span style={styles.chevron}>⌄</span></div>; }
function SummaryCard({ title, value, tone }) { const tones = { ok:["#062d1d","#22c55e"], warn:["#332107","#f59e0b"], info:["#08233d","#38bdf8"], purple:["#251438","#c084fc"], neutral:["#171717","#6b7280"] }; const t = tones[tone] || tones.neutral; return <div style={{ padding: 18, borderRadius: 14, border: `1px solid ${t[1]}55`, background: t[0] }}><div style={styles.muted}>{title}</div><div style={{ fontSize: 26, fontWeight: 900, marginTop: 4 }}>{value}</div></div>; }
function Modal({ children, onClose }) { return <div style={styles.overlay} onMouseDown={onClose}><div style={styles.dialog} onMouseDown={(e) => e.stopPropagation()}>{children}</div></div>; }

const styles = {
  page:{padding:"24px 28px 40px",maxWidth:1700,margin:"0 auto"}, header:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:20,flexWrap:"wrap"}, toolbar:{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}, filters:{display:"flex",gap:10,margin:"22px 0 14px",flexWrap:"wrap"}, summaryGrid:{display:"grid",gridTemplateColumns:"repeat(4,minmax(170px,1fr))",gap:12,marginBottom:14}, notice:{padding:"12px 14px",border:"1px solid #a16207",background:"#2b2008",borderRadius:10,marginBottom:14,color:"#fde68a"}, tableWrap:{overflow:"auto",border:"1px solid var(--border)",borderRadius:14}, table:{width:"100%",borderCollapse:"separate",borderSpacing:0}, dayHead:{padding:"10px 8px",borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",textAlign:"center",background:"var(--nav-bg)",minWidth:112}, stickyHead:{padding:"11px 14px",borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",textAlign:"left",background:"var(--nav-bg)",minWidth:210,position:"sticky",left:0,zIndex:3}, stickyCell:{padding:"10px 14px",borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",background:"var(--bg)",position:"sticky",left:0,zIndex:2,minWidth:210}, cell:{padding:5,borderBottom:"1px solid var(--border)",borderRight:"1px solid var(--border)",textAlign:"center",height:56,verticalAlign:"middle"}, clickableCell:{cursor:"pointer"}, totalCell:{padding:6,borderBottom:"1px solid var(--border)",textAlign:"center",minWidth:84}, shiftBox:{display:"grid",gap:1,textAlign:"left",padding:"6px 8px",borderRadius:8,border:"1px solid #22c55e",background:"#08351f",margin:"1px 0",lineHeight:1.15}, nightBox:{display:"grid",gap:1,textAlign:"left",padding:"6px 8px",borderRadius:8,border:"1px solid #3b82f6",background:"#0b2850",margin:"1px 0",lineHeight:1.15}, ptoBox:{padding:"7px 8px",borderRadius:8,border:"1px solid #a855f7",background:"#34134b",fontWeight:900}, openBox:{display:"grid",gap:1,textAlign:"left",padding:"6px 8px",borderRadius:8,border:"1px solid #38bdf8",background:"#0a2940",fontWeight:900,margin:"1px 0"}, emptyHint:{opacity:.28,fontSize:18,fontWeight:800}, otBadge:{fontSize:11,fontWeight:900,color:"#f87171",marginTop:2}, button:{background:"transparent",color:"inherit",border:"1px solid var(--border)",borderRadius:10,padding:"10px 14px",fontWeight:800}, activeButton:{background:"#0b4ea2",color:"white",border:"1px solid #3b82f6",borderRadius:10,padding:"10px 16px",fontWeight:900}, primaryButton:{background:"#2563eb",color:"white",border:"1px solid #3b82f6",borderRadius:10,padding:"10px 16px",fontWeight:900}, input:{background:"var(--card-bg)",color:"inherit",border:"1px solid var(--border)",borderRadius:10,padding:"10px 12px",minWidth:150}, selectWrap:{position:"relative",minWidth:170}, select:{appearance:"none",WebkitAppearance:"none",width:"100%",background:"var(--card-bg)",color:"inherit",border:"1px solid var(--border)",borderRadius:10,padding:"10px 34px 10px 12px",fontWeight:800}, chevron:{position:"absolute",right:12,top:"50%",transform:"translateY(-54%)",pointerEvents:"none",opacity:.7,fontSize:18}, muted:{opacity:.65}, smallMuted:{opacity:.65,fontSize:13,marginTop:3}, label:{display:"grid",gap:6,fontWeight:800,margin:"12px 0"}, overlay:{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"grid",placeItems:"center",zIndex:9999,padding:20}, dialog:{width:"min(620px,94vw)",maxHeight:"88vh",overflow:"auto",background:"var(--bg)",border:"1px solid var(--border)",borderRadius:16,padding:24,boxShadow:"0 24px 80px rgba(0,0,0,.45)"}
};
