// backend/routes/organizations.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin"); // ✅ service role client
const { requireAuth } = require("../middleware/auth");

// Helper: only superadmin can manage/list orgs
function requireSuperAdmin(req, res, next) {
  if (String(req.role || "").toLowerCase() !== "superadmin") {
    return res.status(403).json({ error: "SuperAdmin only" });
  }
  next();
}

// Create org
router.post("/", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { org_code, name, logo_url } = req.body || {};

    if (!org_code || !name) {
      return res.status(400).json({ error: "org_code and name are required" });
    }

    const payload = {
      org_code: String(org_code).trim(),
      name: String(name).trim(),
      logo_url: logo_url ? String(logo_url).trim() : null,
    };

    const { data, error } = await supabaseAdmin
      .from("orgs")
      .insert([payload])
      .select("*")
      .single();

    if (error) return res.status(400).json({ error: error.message });
    res.json(data);
  } catch (e) {
    console.error("ORG CREATE ERROR:", e);
    res.status(500).json({ error: "Server error" });
  }
});

// List orgs (superadmin only)
router.get("/", requireAuth, requireSuperAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("orgs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return res.status(400).json({ error: error.message });
    res.json(data || []);
  } catch (e) {
    console.error("ORG LIST ERROR:", e);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
