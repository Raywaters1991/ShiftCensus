// backend/routes/orgSettings.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");
const requireOrg = require("../middleware/requireOrg");

function isSuperAdmin(req) {
  return String(req.user?.app_metadata?.role || "").toLowerCase() === "superadmin";
}

// Who is allowed to change privacy settings?
function canManagePrivacy(role) {
  const r = String(role || "").toLowerCase();
  return ["admin", "don", "ed", "superadmin"].includes(r);
}

// Who can change layout (same bucket as privacy, usually admin/DON/ED)
function canManageLayout(role) {
  return canManagePrivacy(role);
}

function clampInt(v, min, max, fallback) {
  const n = parseInt(String(v ?? ""), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

// GET /api/org-settings (org-scoped)
router.get("/", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const { data, error } = await supabase
    .from("org_settings")
    .select("*")
    .eq("org_id", orgId)
    .single();

  if (error || !data) {
    // Return defaults if none exist
    return res.json({
      org_id: orgId,
      show_patient_identifiers: false,
      identifier_format: "first_last_initial",
      identifiers_acknowledged_at: null,
      identifiers_acknowledged_by: null,
      updated_at: null,

      // NEW defaults (safe)
      room_count: null,
      beds_per_room: null,
    });
  }

  // Ensure new fields always exist in response
  res.json({
    ...data,
    room_count: data.room_count ?? null,
    beds_per_room: data.beds_per_room ?? null,
  });
});

// PUT /api/org-settings/identifiers (org-scoped)
router.put("/identifiers", requireAuth, requireOrg, async (req, res) => {
  if (!canManagePrivacy(req.role)) {
    return res.status(403).json({ error: "Insufficient role" });
  }

  const orgId = req.orgId;
  const { enabled, format, acknowledged } = req.body || {};

  const enable = !!enabled;
  const fmt =
    format === "initials" || format === "first_last_initial"
      ? format
      : "first_last_initial";

  // Require acknowledgment only when enabling
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

  const { data, error } = await supabase
    .from("org_settings")
    .upsert(payload)
    .select()
    .single();

  if (error) {
    console.error("ORG SETTINGS UPDATE ERROR:", error);
    return res.status(500).json({ error: "Failed to update org settings" });
  }

  // Audit log (best effort)
  try {
    await supabase.from("audit_logs").insert({
      org_id: orgId,
      user_id: req.user.id,
      action: "UPDATE_PATIENT_IDENTIFIER_SETTING",
      details: {
        enabled: enable,
        format: fmt,
        actor_role: req.role,
        actor_is_superadmin: isSuperAdmin(req),
      },
    });
  } catch (e) {
    console.warn("Audit log insert failed:", e?.message || e);
  }

  res.json(data);
});

// ==================================================
// NEW: LAYOUT ENDPOINTS
// ==================================================

// GET /api/org-settings/layout
router.get("/layout", requireAuth, requireOrg, async (req, res) => {
  const orgId = req.orgId;

  const { data, error } = await supabase
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
router.put("/layout", requireAuth, requireOrg, async (req, res) => {
  if (!canManageLayout(req.role)) {
    return res.status(403).json({ error: "Insufficient role" });
  }

  const orgId = req.orgId;

  // tune limits as you like
  const room_count = clampInt(req.body?.room_count, 1, 200, 10);
  const beds_per_room = clampInt(req.body?.beds_per_room, 1, 6, 2);

  const payload = {
    org_id: orgId,
    room_count,
    beds_per_room,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("org_settings")
    .upsert(payload)
    .select("room_count,beds_per_room")
    .single();

  if (error) {
    console.error("ORG SETTINGS LAYOUT PUT ERROR:", error);
    return res.status(500).json({ error: "Failed to save layout" });
  }

  // Audit log (best effort)
  try {
    await supabase.from("audit_logs").insert({
      org_id: orgId,
      user_id: req.user.id,
      action: "UPDATE_FACILITY_LAYOUT",
      details: {
        room_count,
        beds_per_room,
        actor_role: req.role,
        actor_is_superadmin: isSuperAdmin(req),
      },
    });
  } catch (e) {
    console.warn("Audit log insert failed:", e?.message || e);
  }

  res.json(data);
});

module.exports = router;
