// controllers/orgSettingsController.js
import { supabaseAdmin } from "../supabaseAdmin.js";

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

export async function putLunchBreak(req, res) {
  const orgId = req.org.id;
  const minutes = clampInt(req.body?.minutes, 0, 240, 30);

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .upsert({ org_id: orgId, lunch_break_minutes: minutes }, { onConflict: "org_id" })
    .select("org_id, lunch_break_minutes")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}

export async function putPayPeriod(req, res) {
  const orgId = req.org.id;

  const pay_period = {
    length_days: clampInt(req.body?.length_days, 7, 31, 14),
    anchor_date: req.body?.anchor_date || null, // "YYYY-MM-DD"
  };

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .upsert({ org_id: orgId, pay_period }, { onConflict: "org_id" })
    .select("org_id, pay_period")
    .single();

  if (error) return res.status(500).json({ error: error.message });
  return res.json(data);
}
