// backend/routes/organizations.js

const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth, requireSuperAdmin } = require("../middleware/auth");

// Create org
router.post("/", requireAuth, requireSuperAdmin, async (req, res) => {
  const { org_code, name, logo_url } = req.body;

  if (!org_code || !name) {
    return res.status(400).json({ error: "org_code and name are required" });
  }

  const payload = {
    org_code: String(org_code).trim(),
    name: String(name).trim(),
    logo_url: logo_url ? String(logo_url).trim() : null,
  };

  const { data, error } = await supabase
    .from("orgs")
    .insert([payload])
    .select("*")
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// List orgs
router.get("/", requireAuth, requireSuperAdmin, async (req, res) => {
  const { data, error } = await supabase
    .from("orgs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
