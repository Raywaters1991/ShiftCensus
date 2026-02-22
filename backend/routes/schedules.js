// backend/routes/schedules.js
const express = require("express");
const router = express.Router();

const { DateTime } = require("luxon");

const supabase = require("../supabase"); // anon (auth verify)
const supabaseAdmin = require("../supabaseAdmin"); // service role

function getBearerToken(req) {
  const h = req.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid or expired token" });

    req.user = data.user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

function parseScheduleType(x) {
  const v = String(x || "regular").toLowerCase();
  return v === "oncall" ? "oncall" : "regular";
}

function parseMonthKey(monthKey) {
  // "YYYY-MM"
  const [yStr, mStr] = String(monthKey || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m || m < 1 || m > 12) return null;
  return { y, m, monthKey: `${yStr}-${String(m).padStart(2, "0")}` };
}

function coerceTimeHHMMSS(t) {
  // Accept "06:00" or "06:00:00"
  const s = String(t || "").trim();
  if (!s) return null;
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`;
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s;
  return null;
}

function computeUtcRangeFromLocal({ dateISO, startLocal, endLocal, timezone }) {
  // dateISO: "YYYY-MM-DD"
  // startLocal/endLocal: "HH:mm:ss"
  // timezone: IANA (e.g., America/Los_Angeles)
  const tz = timezone || "America/Los_Angeles";
  const s = coerceTimeHHMMSS(startLocal);
  const e = coerceTimeHHMMSS(endLocal);

  // If template doesn't define times, we can't compute start_time/end_time.
  if (!s || !e) return { startUtc: null, endUtc: null };

  const [sh, sm, ss] = s.split(":").map((x) => Number(x));
  const [eh, em, es] = e.split(":").map((x) => Number(x));

  let start = DateTime.fromISO(dateISO, { zone: tz }).set({ hour: sh, minute: sm, second: ss || 0 });
  let end = DateTime.fromISO(dateISO, { zone: tz }).set({ hour: eh, minute: em, second: es || 0 });

  // Overnight shift: end <= start -> push end to next day
  if (end <= start) end = end.plus({ days: 1 });

  return {
    startUtc: start.toUTC().toISO(),
    endUtc: end.toUTC().toISO(),
  };
}

// ----------------------------------------------------
// POST /api/schedules/generate
// body: { month: "YYYY-MM", department_id, schedule_type?: "regular"|"oncall" }
// Creates (or replaces) draft slots based on staffing_minimums
// ----------------------------------------------------
router.post("/generate", requireAuth, async (req, res) => {
  try {
    const { month, department_id } = req.body || {};
    const schedule_type = parseScheduleType(req.body?.schedule_type);

    if (!month || !department_id) {
      return res.status(400).json({ error: "Missing month or department_id" });
    }

    const monthParsed = parseMonthKey(month);
    if (!monthParsed) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    // Department -> org_code
    const { data: dept, error: deptErr } = await supabaseAdmin
      .from("departments")
      .select("id, org_code")
      .eq("id", department_id)
      .maybeSingle();
    if (deptErr) throw deptErr;
    if (!dept?.org_code) return res.status(400).json({ error: "Invalid department_id" });

    const org_code = dept.org_code;

    // Upsert batch (draft)
    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("schedule_batches")
      .upsert(
        {
          org_code,
          department_id,
          schedule_type,
          month_key: monthParsed.monthKey,
          status: "draft",
          created_by: req.user.id,
        },
        { onConflict: "department_id,schedule_type,month_key" }
      )
      .select("*")
      .maybeSingle();
    if (batchErr) throw batchErr;

    // Wipe existing slots for this batch (clean regenerate)
    const { error: delErr } = await supabaseAdmin.from("schedule_slots").delete().eq("batch_id", batch.id);
    if (delErr) throw delErr;

    // Pull minimums for dept + schedule_type
    const { data: mins, error: minErr } = await supabaseAdmin
      .from("staffing_minimums")
      .select("id, unit_id, role, template_id, dow, min_count")
      .eq("department_id", department_id)
      .eq("schedule_type", schedule_type);
    if (minErr) throw minErr;

    const minimums = mins || [];
    if (minimums.length === 0) {
      return res.json({
        ok: true,
        batch,
        createdSlots: 0,
        note: "No staffing_minimums rows found for that department/schedule_type.",
      });
    }

    // Determine a timezone to iterate calendar days in.
    // Best-effort: use timezone from any referenced template.
    const templateIds = Array.from(new Set(minimums.map((r) => r.template_id).filter(Boolean)));
    let tz = "America/Los_Angeles";

    if (templateIds.length > 0) {
      const { data: trows, error: tErr } = await supabaseAdmin
        .from("department_shift_templates")
        .select("id, timezone")
        .in("id", templateIds);
      if (!tErr && Array.isArray(trows) && trows.length > 0) {
        tz = trows.find((x) => x?.timezone)?.timezone || tz;
      }
    }

    // Build slots for each day in month in that timezone (so DOW matches expectations)
    const start = DateTime.fromObject({ year: monthParsed.y, month: monthParsed.m, day: 1 }, { zone: tz }).startOf("day");
    const end = start.endOf("month").startOf("day"); // last day start

    const slots = [];
    for (let cursor = start; cursor <= end; cursor = cursor.plus({ days: 1 })) {
      // Luxon weekday: Mon=1..Sun=7; convert to Sun=0..Sat=6
      const dow = cursor.weekday % 7;
      const dateStr = cursor.toISODate(); // "YYYY-MM-DD"

      const todaysRules = minimums.filter((r) => Number(r.dow) === dow && Number(r.min_count) > 0);

      for (const r of todaysRules) {
        const count = Number(r.min_count);
        for (let pos = 1; pos <= count; pos++) {
          slots.push({
            batch_id: batch.id,
            org_code,
            department_id,
            schedule_type,
            slot_date: dateStr,
            template_id: r.template_id,
            unit_id: r.unit_id || null, // text for now
            role: r.role,
            position_no: pos,
          });
        }
      }
    }

    // Insert slots (chunked)
    let created = 0;
    const chunkSize = 500;
    for (let i = 0; i < slots.length; i += chunkSize) {
      const chunk = slots.slice(i, i + chunkSize);
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

// ----------------------------------------------------
// POST /api/schedules/publish/:batchId
// Marks batch published and creates/updates actual shifts from slots
// ----------------------------------------------------
router.post("/publish/:batchId", requireAuth, async (req, res) => {
  try {
    const batchId = req.params.batchId;

    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("schedule_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();
    if (batchErr) throw batchErr;
    if (!batch?.id) return res.status(404).json({ error: "Batch not found" });

    // Mark published
    const { data: updated, error: updErr } = await supabaseAdmin
      .from("schedule_batches")
      .update({
        status: "published",
        published_at: new Date().toISOString(),
        published_by: req.user.id,
      })
      .eq("id", batchId)
      .select("*")
      .maybeSingle();
    if (updErr) throw updErr;

    // Pull slots with template times
    const { data: slotFull, error: slotErr } = await supabaseAdmin
      .from("schedule_slots")
      .select(
        `
        id,
        org_code,
        department_id,
        schedule_type,
        slot_date,
        role,
        unit_id,
        assigned_staff_id,
        template_id,
        t:department_shift_templates!schedule_slots_template_id_fkey (
          start_local,
          end_local,
          timezone,
          name
        )
      `
      )
      .eq("batch_id", batchId);

    if (slotErr) throw slotErr;

    const slots = slotFull || [];
    if (slots.length === 0) {
      return res.json({ ok: true, batch: updated, createdOrUpdatedShifts: 0, note: "No slots in batch." });
    }

    // Build shift rows for upsert
    const shifts = slots.map((s) => {
      const dateISO = (() => {
        // slot_date is DATE -> may come as "YYYY-MM-DD" string
        const v = s.slot_date;
        if (!v) return null;
        return String(v).slice(0, 10);
      })();

      const startLocal = s?.t?.start_local || null;
      const endLocal = s?.t?.end_local || null;
      const tz = s?.t?.timezone || "America/Los_Angeles";

      const utc = dateISO
        ? computeUtcRangeFromLocal({ dateISO, startLocal, endLocal, timezone: tz })
        : { startUtc: null, endUtc: null };

      return {
        // Required for your auditing & idempotent publish
        schedule_slot_id: s.id,

        // Your existing shifts schema uses org_code + shift_date + local times + timezone
        org_code: s.org_code,
        shift_date: dateISO,

        // staffing
        staff_id: s.assigned_staff_id ? String(s.assigned_staff_id) : null,
        role: s.role || null,

        // local times (UI)
        start_local: startLocal,
        end_local: endLocal,
        timezone: tz,

        // UTC timestamps (for correct date handling across roles/superadmin views)
        start_time: utc.startUtc,
        end_time: utc.endUtc,

        // Unit: right now unit_id is TEXT; store it in shifts.unit for display.
        // Later, when you migrate unit_id -> bigint, swap to join and store the unit name instead.
        unit: s.unit_id || null,

        // shift_type: template name is a good display label ("Day 6-6", "Kitchen AM", etc.)
        shift_type: s?.t?.name || null,
      };
    });

    // Bulk upsert shifts on schedule_slot_id (requires the SQL migration above)
    let upserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < shifts.length; i += chunkSize) {
      const chunk = shifts.slice(i, i + chunkSize);

      const { error: upErr } = await supabaseAdmin
        .from("shifts")
        .upsert(chunk, { onConflict: "schedule_slot_id" });

      if (upErr) throw upErr;
      upserted += chunk.length;
    }

    // TODO: notifications per department/org on publish (next step)
    return res.json({ ok: true, batch: updated, createdOrUpdatedShifts: upserted });
  } catch (e) {
    console.error("SCHEDULE PUBLISH ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

// ----------------------------------------------------
// GET /api/schedules/batch/:batchId
// ----------------------------------------------------
router.get("/batch/:batchId", requireAuth, async (req, res) => {
  try {
    const batchId = req.params.batchId;

    const { data: batch, error: batchErr } = await supabaseAdmin
      .from("schedule_batches")
      .select("*")
      .eq("id", batchId)
      .maybeSingle();
    if (batchErr) throw batchErr;
    if (!batch?.id) return res.status(404).json({ error: "Batch not found" });

    const { data: slots, error: slotErr } = await supabaseAdmin
      .from("schedule_slots")
      .select("*")
      .eq("batch_id", batchId)
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
