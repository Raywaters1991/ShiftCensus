const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth, requireSuperAdmin } = require("../middleware/auth");

// Create org
router.post("/", requireAuth, requireSuperAdmin, async (req, res) => {
  const { org_code, name } = req.body;

  const { data, error } = await supabase
    .from("orgs")
    .insert([{ org_code, name }])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

// List orgs
router.get("/", requireAuth, requireSuperAdmin, async (req, res) => {
  const { data, error } = await supabase.from("orgs").select("*");

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

module.exports = router;
