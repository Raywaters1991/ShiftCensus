// backend/routes/schedules.js
const express = require("express");
const router = express.Router();
const { DateTime } = require("luxon");

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

router.use(requireAuth);
router.use(requireOrg);
router.use(requireScheduleAccess);

function parseScheduleType(x) {
  const v = String(x || "regular").toLowerCase();
  return v === "oncall" ? "oncall" : "regular";
}

function parseMonthKey(monthKey) {
  const [yStr, mStr] = String(monthKey || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || m < 1 || m > 12) return null;
  return { y, m, monthKey: `${yStr}-${String(m).padStart(2, "0")}` };
}

function coerceTimeHHMMSS(t) {
  const s = String(t || "").trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
}

function computeUtcRangeFromLocal({ dateISO, startLocal, endLocal, timezone }) {
  const tz = timezone || "America/Los_Angeles";
  const s = coerceTimeHHMMSS(startLocal);
  const e = coerceTimeHHMMSS(endLocal);
  if (!s || !e) return { startUtc: null, endUtc: null };

  const [sh, sm, ss] = s.split(":").map(Number);
  const [eh, em, es] = e.split(":").map(Number);
  let start = DateTime.fromISO(dateISO, { zone: tz }).set({ hour: sh, minute: sm, second: ss || 0 });
  let end = DateTime.fromISO(dateISO, { zone: tz }).set({ hour: eh, minute: em, second: es || 0 });
  if (end <= start) end = end.plus({ days: 1 });
  return { startUtc: start.toUTC().toISO(), endUtc: end.toUTC().toISO() };
}

router.post("/generate", async (req, res) => {
  try {
    const { month, department_id } = req.body || {};
    const schedule_type = parseScheduleType(req.body?.schedule_type);
    const orgCode = req.orgCode || req.org_code;

    if (!month || !department_id) return res.status(400).json({ error: "Missing month or department_id" });
    const monthParsed = parseMonthKey(month);
    if (!monthParsed) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    const { data: dept, error: deptErr } = await supabaseAdmin
      .from("departments")
      .select("id, org_code")
      .eq("id", department_id)
      .eq("org_code", orgCode)
      .maybeSingle();
    if (deptErr) throw deptErr;
    if (!dept?.id) return res.status(404).json({ error: "Department not found in this organization" });

    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("schedule_batches")
      .upsert({
        org_code: orgCode,
        department_id,
        schedule_type,
        month_key: monthParsed.monthKey,
        status: "draft",
        created_by: req.user.id,
      }, { onConflict: "department_id,schedule_type,month_key" })
      .select("*")
      .maybeSingle();
    if (batchErr) throw batchErr;

    const { error: delErr } = await supabaseAdmin
      .from("schedule_slots")
      .delete()
      .eq("batch_id", batch.id)
      .eq("org_code", orgCode);
    if (delErr) throw delErr;

    const { data: mins, error: minErr } = await supabaseAdmin
      .from("staffing_minimums")
      .select("id, unit_id, role, template_id, dow, min_count")
      .eq("department_id", department_id)
      .eq("schedule_type", schedule_type);
    if (minErr) throw minErr;

    const minimums = mins || [];
    if (!minimums.length) return res.json({ ok: true, batch, createdSlots: 0, note: "No staffing_minimums rows found for that department/schedule_type." });

    const templateIds = Array.from(new Set(minimums.map(r => r.template_id).filter(Boolean)));
    let tz = "America/Los_Angeles";
    if (templateIds.length) {
      const { data: trows } = await supabaseAdmin
        .from("department_shift_templates")
        .select("id, timezone, org_code")
        .in("id", templateIds)
        .eq("org_code", orgCode);
      if (Array.isArray(trows) && trows.length) tz = trows.find(x => x?.timezone)?.timezone || tz;
    }

    const start = DateTime.fromObject({ year: monthParsed.y, month: monthParsed.m, day: 1 }, { zone: tz }).startOf("day");
    const end = start.endOf("month").startOf("day");
    const slots = [];
    for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
      const dow = cursor.weekday % 7;
      const dateStr = cursor.toISODate();
      for (const r of minimums.filter(r => Number(r.dow) === dow && Number(r.min_count) > 0)) {
        for (let pos = 1; pos <= Number(r.min_count); pos++) {
          slots.push({ batch_id: batch.id, org_code: orgCode, department_id, schedule_type, slot_date: dateStr, template_id: r.template_id, unit_id: r.unit_id || null, role: r.role, position_no: pos });
        }
      }
    }

    let created = 0;
    for (let i = 0; i < slots.length; i += 500) {
      const chunk = slots.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("schedule_slots").insert(chunk);
      if (error) throw error;
      created += chunk.length;
    }
    return res.json({ ok: true, batch, createdSlots: created, timezoneUsed: tz });
  } catch (e) {
    console.error("SCHEDULE GENERATE ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

router.post("/publish/:batchId", async (req, res) => {
  try {
    const batchId = req.params.batchId;
    const orgCode = req.orgCode || req.org_code;

    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("schedule_batches")
      .select("*")
      .eq("id", batchId)
      .eq("org_code", orgCode)
      .maybeSingle();
    if (batchErr) throw batchErr;
    if (!batch?.id) return res.status(404).json({ error: "Batch not found in this organization" });

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("schedule_batches")
      .update({ status: "published", published_at: new Date().toISOString(), published_by: req.user.id })
      .eq("id", batchId)
      .eq("org_code", orgCode)
      .select("*")
      .maybeSingle();
    if (updErr) throw updErr;

    const { data: slotFull, error: slotErr } = await supabaseAdmin
      .from("schedule_slots")
      .select(`id,org_code,department_id,schedule_type,slot_date,role,unit_id,assigned_staff_id,template_id,t:department_shift_templates!schedule_slots_template_id_fkey(start_local,end_local,timezone,name)`)
      .eq("batch_id", batchId)
      .eq("org_code", orgCode);
    if (slotErr) throw slotErr;

    const slots = slotFull || [];
    if (!slots.length) return res.json({ ok: true, batch: updated, createdOrUpdatedShifts: 0, note: "No slots in batch." });

    const shifts = slots.map(s => {
      const dateISO = s.slot_date ? String(s.slot_date).slice(0, 10) : null;
      const startLocal = s?.t?.start_local || null;
      const endLocal = s?.t?.end_local || null;
      const tz = s?.t?.timezone || "America/Los_Angeles";
      const utc = dateISO ? computeUtcRangeFromLocal({ dateISO, startLocal, endLocal, timezone: tz }) : { startUtc: null, endUtc: null };
      return { schedule_slot_id:s.id, org_code:orgCode, shift_date:dateISO, staff_id:s.assigned_staff_id?String(s.assigned_staff_id):null, role:s.role||null, start_local:startLocal, end_local:endLocal, timezone:tz, start_time:utc.startUtc, end_time:utc.endUtc, unit:s.unit_id||null, shift_type:s?.t?.name||null };
    });

    let upserted = 0;
    for (let i = 0; i < shifts.length; i += 500) {
      const chunk = shifts.slice(i, i + 500);
      const { error: upErr } = await supabaseAdmin.from("shifts").upsert(chunk, { onConflict: "schedule_slot_id" });
      if (upErr) throw upErr;
      upserted += chunk.length;
    }
    return res.json({ ok: true, batch: updated, createdOrUpdatedShifts: upserted });
  } catch (e) {
    console.error("SCHEDULE PUBLISH ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

router.get("/batch/:batchId", async (req, res) => {
  try {
    const batchId = req.params.batchId;
    const orgCode = req.orgCode || req.org_code;

    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("schedule_batches")
      .select("*")
      .eq("id", batchId)
      .eq("org_code", orgCode)
      .maybeSingle();
    if (batchErr) throw batchErr;
    if (!batch?.id) return res.status(404).json({ error: "Batch not found in this organization" });

    const { data: slots, error: slotErr } = await supabaseAdmin
      .from("schedule_slots")
      .select("*")
      .eq("batch_id", batchId)
      .eq("org_code", orgCode)
      .order("slot_date", { ascending: true })
      .order("role", { ascending: true })
      .order("position_no", { ascending: true });
    if (slotErr) throw slotErr;

    return res.json({ batch, slots: slots || [] });
  } catch (e) {
    console.error("SCHEDULE READ ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

module.exports = router;
