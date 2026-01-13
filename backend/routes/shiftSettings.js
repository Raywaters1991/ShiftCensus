// backend/routes/shiftSettings.js

const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// -----------------------------------------------------
// ORG CONTEXT (SOURCE OF TRUTH = HEADER)
// -----------------------------------------------------
function getOrg(req) {
  return req.headers["x-org-code"] || null;
}

function isSuperAdmin(req) {
  return req.user?.app_metadata?.role === "superadmin";
}

// =====================================================
// GET /shift-settings  (ORG SAFE)
// =====================================================
router.get("/", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);

    if (!org) {
      return res.status(400).json({ error: "Missing x-org-code header" });
    }

    const { data, error } = await supabase
      .from("shift_settings")
      .select("*")
      .eq("org_code", org) // 🔒 HARD ORG SCOPE
      .order("role", { ascending: true })
      .order("shift_type", { ascending: true });

    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("SHIFT_SETTINGS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// POST /shift-settings  (ORG SAFE)
// body: { role, shift_type, start_local, end_local }
// =====================================================
router.post("/", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);

    if (!org) {
      return res.status(400).json({ error: "Missing x-org-code header" });
    }

    const { role, shift_type, start_local, end_local } = req.body;

    if (!role || !shift_type || !start_local || !end_local) {
      return res.status(400).json({
        error:
          "Missing required fields: role, shift_type, start_local, end_local",
      });
    }

    const { data, error } = await supabase
      .from("shift_settings")
      .insert({
        org_code: org, // 🔒 ORG ASSIGNED HERE
        role,
        shift_type,
        start_local,
        end_local,
      })
      .select()
      .single();

    if (error) throw error;

    res.json(data);
  } catch (err) {
    console.error("SHIFT_SETTINGS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// PATCH /shift-settings/:id  (ORG SAFE — EDIT)
// body: { role, shift_type, start_local, end_local }
// =====================================================
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    const { id } = req.params;

    if (!org) {
      return res.status(400).json({ error: "Missing x-org-code header" });
    }

    const { role, shift_type, start_local, end_local } = req.body;

    if (!role || !shift_type || !start_local || !end_local) {
      return res.status(400).json({
        error:
          "Missing required fields: role, shift_type, start_local, end_local",
      });
    }

    // 🔒 Update only if record belongs to org
    const { data, error } = await supabase
      .from("shift_settings")
      .update({
        role,
        shift_type,
        start_local,
        end_local,
      })
      .eq("id", id)
      .eq("org_code", org)
      .select()
      .single();

    if (error) throw error;
    if (!data) {
      return res.status(403).json({ error: "Not authorized" });
    }

    res.json(data);
  } catch (err) {
    console.error("SHIFT_SETTINGS PATCH ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// =====================================================
// DELETE /shift-settings/:id  (ORG SAFE)
// =====================================================
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    const { id } = req.params;

    if (!org) {
      return res.status(400).json({ error: "Missing x-org-code header" });
    }

    const { error } = await supabase
      .from("shift_settings")
      .delete()
      .eq("id", id)
      .eq("org_code", org); // 🔒 HARD ORG CHECK

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("SHIFT_SETTINGS DELETE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
