// backend/services/scheduleEngine.js
const { DateTime } = require("luxon");
const supabaseAdmin = require("../supabaseAdmin");

function monthRangeLocal(month, tz) {
  // month: "YYYY-MM"
  const [y, m] = month.split("-").map(Number);
  const start = DateTime.fromObject({ year: y, month: m, day: 1 }, { zone: tz }).startOf("day");
  const end = start.plus({ months: 1 });
  return { start, end };
}

function localShiftToUtc({ dateLocal, startLocal, endLocal, tz }) {
  // dateLocal: Luxon DateTime at start of local day
  // startLocal/endLocal: "HH:mm:ss" or "HH:mm"
  const [sh, sm, ss = 0] = String(startLocal).split(":").map(Number);
  const [eh, em, es = 0] = String(endLocal).split(":").map(Number);

  const start = dateLocal.set({ hour: sh, minute: sm, second: ss });
  let end = dateLocal.set({ hour: eh, minute: em, second: es });

  // If end <= start, it crosses midnight into next day
  if (end <= start) end = end.plus({ days: 1 });

  return {
    startUtc: start.toUTC(),
    endUtc: end.toUTC(),
    startLocalStr: start.toFormat("HH:mm:ss"),
    endLocalStr: end.toFormat("HH:mm:ss"),
  };
}

/**
 * Generate required shift slots from staffing_minimums (+ shift patterns)
 * Idempotent via unique index on shifts_generated_unique
 */
async function generateDepartmentSchedule({
  orgCode,
  departmentId,
  month,
  timezone,
  generatedBy,
  scheduleType = "NORMAL", // future: "ON_CALL"
}) {
  const tz = timezone || "America/Los_Angeles";
  const { start, end } = monthRangeLocal(month, tz);

  // 1) Create schedule_run (audit)
  const { data: run, error: runErr } = await supabaseAdmin
    .from("schedule_runs")
    .insert({
      org_code: orgCode,
      department_id: departmentId,
      month,
      timezone: tz,
      generated_by: generatedBy || null,
    })
    .select("*")
    .single();

  if (runErr) throw runErr;

  // 2) Load staffing minimums for this dept/org
  const { data: minimums, error: minErr } = await supabaseAdmin
    .from("staffing_minimums")
    .select("id, org_code, department_id, unit_id, role, dow, min_count, shift_pattern_id, schedule_type")
    .eq("org_code", orgCode)
    .eq("department_id", departmentId);

  if (minErr) throw minErr;

  // Filter by schedule_type if you have enum; otherwise ignore
  const mins = (minimums || []).filter((m) => {
    if (!m.schedule_type) return true;
    return String(m.schedule_type).toUpperCase() === String(scheduleType).toUpperCase();
  });

  // 3) Load shift patterns (by ids referenced in minimums)
  const patternIds = Array.from(new Set(mins.map((m) => m.shift_pattern_id).filter(Boolean)));
  if (patternIds.length === 0) {
    throw new Error("No shift_pattern_id found in staffing_minimums for this department.");
  }

  const { data: patterns, error: patErr } = await supabaseAdmin
    .from("department_shift_patterns")
    .select("id, name, start_local, end_local, timezone, is_on_call")
    .in("id", patternIds);

  if (patErr) throw patErr;

  const patMap = new Map((patterns || []).map((p) => [p.id, p]));

  // 4) Build required slots for the month
  const shiftsToInsert = [];
  for (let d = start; d < end; d = d.plus({ days: 1 })) {
    const dow = d.weekday % 7; // Luxon: Mon=1..Sun=7 → convert to Sun=0..Sat=6
    // Convert: Sun=7 -> 0, Mon=1 -> 1, ...
    const dow0 = dow === 0 ? 0 : dow; // (Luxon gives Sun=0 from this expression)
    // Actually: d.weekday%7 yields Sun=0, Mon=1..Sat=6 already
    const dayMins = mins.filter((m) => Number(m.dow) === Number(dow0));

    for (const rule of dayMins) {
      const pattern = patMap.get(rule.shift_pattern_id);
      if (!pattern) continue;

      const ruleTz = pattern.timezone || tz;

      const { startUtc, endUtc, startLocalStr, endLocalStr } = localShiftToUtc({
        dateLocal: d.setZone(ruleTz),
        startLocal: pattern.start_local,
        endLocal: pattern.end_local,
        tz: ruleTz,
      });

      const shiftDate = d.setZone(ruleTz).toISODate(); // ✅ local date

      const count = Number(rule.min_count || 0);
      for (let i = 1; i <= count; i++) {
        shiftsToInsert.push({
          org_code: orgCode,
          department_id: departmentId,
          unit_id: rule.unit_id ?? null, // nursing rules have it, dietary null
          role: rule.role,
          shift_date: shiftDate, // ✅ local calendar date
          start_time: startUtc.toISO(), // UTC timestamp
          end_time: endUtc.toISO(),     // UTC timestamp
          start_local: startLocalStr,
          end_local: endLocalStr,
          timezone: ruleTz,
          shift_type: pattern.name || null,
          shift_pattern_id: pattern.id,
          schedule_run_id: run.id,
          slot_index: i,
          staff_id: null, // open until assigned
          is_on_call: !!pattern.is_on_call,
          is_published: false,
        });
      }
    }
  }

  // 5) Insert in chunks (avoid payload limits)
  const chunkSize = 500;
  let inserted = 0;

  for (let i = 0; i < shiftsToInsert.length; i += chunkSize) {
    const chunk = shiftsToInsert.slice(i, i + chunkSize);

    // Use upsert with the unique index constraint (idempotent)
    const { error } = await supabaseAdmin
      .from("shifts")
      .upsert(chunk, { onConflict: "org_code,department_id,shift_date,unit_id,role,shift_pattern_id,slot_index,is_on_call" });

    if (error) throw error;
    inserted += chunk.length;
  }

  return {
    scheduleRunId: run.id,
    insertedSlotsAttempted: inserted,
  };
}

async function publishDepartmentSchedule({ scheduleRunId, publishedBy }) {
  // Mark schedule_run + shifts as published
  const now = new Date().toISOString();

  const { data: run, error: runErr } = await supabaseAdmin
    .from("schedule_runs")
    .update({ published_at: now })
    .eq("id", scheduleRunId)
    .select("*")
    .single();

  if (runErr) throw runErr;

  const { error: shiftsErr } = await supabaseAdmin
    .from("shifts")
    .update({ is_published: true, published_at: now })
    .eq("schedule_run_id", scheduleRunId);

  if (shiftsErr) throw shiftsErr;

  return { scheduleRunId, publishedAt: now };
}

module.exports = {
  generateDepartmentSchedule,
  publishDepartmentSchedule,
};
