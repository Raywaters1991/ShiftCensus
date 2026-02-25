// backend/routes/orgSettings.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

function canManagePrivacy(role) {
  const r = String(role || "").toLowerCase();
  return ["admin", "don", "ed", "superadmin"].includes(r);
}
function canManageLayout(role) {
  return canManagePrivacy(role);
}
function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// GET /api/org-settings (org-scoped)
router.get("/", async (req, res) => {
  const orgId = req.orgId;

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error || !data) {
    return res.json({
      org_id: orgId,
      show_patient_identifiers: false,
      identifier_format: "first_last_initial",
      identifiers_acknowledged_at: null,
      identifiers_acknowledged_by: null,
      updated_at: null,
      room_count: null,
      beds_per_room: null,

      // ✅ NEW
      lunch_break_minutes: 30,
      pay_period_length_days: 14,
      pay_period_anchor_date: null,
    });
  }

  res.json({
    ...data,
    room_count: data.room_count ?? null,
    beds_per_room: data.beds_per_room ?? null,

    // ✅ NEW
    lunch_break_minutes: data.lunch_break_minutes ?? 30,
    pay_period_length_days: data.pay_period_length_days ?? 14,
    pay_period_anchor_date: data.pay_period_anchor_date ?? null,
  });
});

// PUT /api/org-settings/identifiers
router.put("/identifiers", async (req, res) => {
  if (!canManagePrivacy(req.role)) {
    return res.status(403).json({ error: "Insufficient role" });
  }

  const orgId = req.orgId;
  const { enabled, format, acknowledged } = req.body || {};

  const enable = !!enabled;
  const fmt =
    format === "initials" || format === "first_last_initial" ? format : "first_last_initial";

  if (enable && acknowledged !== true) {
    return res.status(400).json({ error: "Acknowledgment required to enable identifiers" });
  }

  const payload = {
    org_id: orgId,
    show_patient_identifiers: enable,
    identifier_format: fmt,
    identifiers_acknowledged_at: enable ? new Date().toISOString() : null,
    identifiers_acknowledged_by: enable ? req.user.id : null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin.from("org_settings").upsert(payload).select().single();

  if (error) {
    console.error("ORG SETTINGS UPDATE ERROR:", error);
    return res.status(500).json({ error: "Failed to update org settings" });
  }

  res.json(data);
});

// GET /api/org-settings/layout
router.get("/layout", async (req, res) => {
  const orgId = req.orgId;

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .select("room_count,beds_per_room")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("ORG SETTINGS LAYOUT GET ERROR:", error);
    return res.status(500).json({ error: "Failed to load layout" });
  }

  res.json({
    room_count: data?.room_count ?? null,
    beds_per_room: data?.beds_per_room ?? null,
  });
});

// PUT /api/org-settings/layout
router.put("/layout", async (req, res) => {
  if (!canManageLayout(req.role)) {
    return res.status(403).json({ error: "Insufficient role" });
  }

  const orgId = req.orgId;
  const room_count = clampInt(req.body?.room_count, 1, 200, 10);
  const beds_per_room = clampInt(req.body?.beds_per_room, 1, 6, 2);

  const payload = {
    org_id: orgId,
    room_count,
    beds_per_room,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .upsert(payload)
    .select("room_count,beds_per_room")
    .single();

  if (error) {
    console.error("ORG SETTINGS LAYOUT PUT ERROR:", error);
    return res.status(500).json({ error: "Failed to save layout" });
  }

  res.json(data);
});

// =====================================================
// ✅ NEW: Lunch Break Minutes
// =====================================================

// GET /api/org-settings/lunch-break
router.get("/lunch-break", async (req, res) => {
  const orgId = req.orgId;

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .select("lunch_break_minutes")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("ORG SETTINGS LUNCH GET ERROR:", error);
    return res.status(500).json({ error: "Failed to load lunch break setting" });
  }

  res.json({ lunch_break_minutes: data?.lunch_break_minutes ?? 30 });
});

// PUT /api/org-settings/lunch-break
router.put("/lunch-break", async (req, res) => {
  if (!canManageLayout(req.role)) {
    return res.status(403).json({ error: "Insufficient role" });
  }

  const orgId = req.orgId;
  const lunch_break_minutes = clampInt(req.body?.lunch_break_minutes, 0, 180, 30);

  const payload = {
    org_id: orgId,
    lunch_break_minutes,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .upsert(payload)
    .select("lunch_break_minutes")
    .single();

  if (error) {
    console.error("ORG SETTINGS LUNCH PUT ERROR:", error);
    return res.status(500).json({ error: "Failed to save lunch break setting" });
  }

  res.json(data);
});

// =====================================================
// ✅ NEW: Pay Period Settings
// =====================================================

// GET /api/org-settings/pay-period
router.get("/pay-period", async (req, res) => {
  const orgId = req.orgId;

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .select("pay_period_length_days,pay_period_anchor_date")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) {
    console.error("ORG SETTINGS PAY PERIOD GET ERROR:", error);
    return res.status(500).json({ error: "Failed to load pay period" });
  }

  res.json({
    pay_period_length_days: data?.pay_period_length_days ?? 14,
    pay_period_anchor_date: data?.pay_period_anchor_date ?? null,
  });
});

// PUT /api/org-settings/pay-period
router.put("/pay-period", async (req, res) => {
  if (!canManageLayout(req.role)) {
    return res.status(403).json({ error: "Insufficient role" });
  }

  const orgId = req.orgId;
  const pay_period_length_days = clampInt(req.body?.pay_period_length_days, 7, 31, 14);
  const raw = req.body?.pay_period_anchor_date ?? null;

  let pay_period_anchor_date = null;
  if (raw) {
    const s = String(raw).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      return res.status(400).json({ error: "pay_period_anchor_date must be YYYY-MM-DD or null" });
    }
    pay_period_anchor_date = s;
  }

  const payload = {
    org_id: orgId,
    pay_period_length_days,
    pay_period_anchor_date,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseAdmin
    .from("org_settings")
    .upsert(payload)
    .select("pay_period_length_days,pay_period_anchor_date")
    .single();

  if (error) {
    console.error("ORG SETTINGS PAY PERIOD PUT ERROR:", error);
    return res.status(500).json({ error: "Failed to save pay period" });
  }

  res.json(data);
});

module.exports = router;
