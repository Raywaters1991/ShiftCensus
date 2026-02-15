const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

async function resolveOrgCode(req) {
  const orgCodeHeader = req.headers["x-org-code"];
  if (orgCodeHeader) return String(orgCodeHeader).trim();
  const orgIdHeader = req.headers["x-org-id"];
  if (!orgIdHeader) return null;

  const { data } = await supabase
    .from("orgs")
    .select("org_code")
    .eq("id", String(orgIdHeader).trim())
    .maybeSingle();

  return data?.org_code ? String(data.org_code).trim() : null;
}

router.get("/", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode) return res.status(400).json({ error: "Missing org_code" });

  const { data, error } = await supabase
    .from("departments")
    .select("*")
    .eq("org_code", orgCode)
    .order("name");

  if (error) return res.status(500).json({ error: "Failed to load departments" });
  res.json(data || []);
});

router.post("/", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode) return res.status(400).json({ error: "Missing org_code" });

  const name = String(req.body?.name || "").trim();
  if (!name) return res.status(400).json({ error: "Name required" });

  const { data, error } = await supabase
    .from("departments")
    .insert([{ org_code: orgCode, name }])
    .select()
    .single();

  if (error) return res.status(500).json({ error: "Failed to create department" });
  res.json(data);
});

module.exports = router;
