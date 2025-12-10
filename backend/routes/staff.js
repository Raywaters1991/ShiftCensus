const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

function getOrg(req) {
  return req.user?.user_metadata?.org_code || null;
}

function isSuperAdmin(req) {
  return req.user?.app_metadata?.role === "superadmin";
}

// =====================================================
// GET STAFF
// =====================================================
router.get("/", requireAuth, async (req, res) => {
  const org_code = getOrg(req);

  const query = supabase.from("staff").select("*").order("id");

  if (!isSuperAdmin(req)) {
    query.eq("org_code", org_code);
  }

  const { data, error } = await query;

  if (error) return res.status(400).json(error);
  res.json(data);
});

// =====================================================
// ADD STAFF
// =====================================================
router.post("/", requireAuth, async (req, res) => {
  const org_code = getOrg(req);
  const { name, role, email, phone } = req.body;

  if (!name || !role)
    return res.status(400).json({ error: "Missing required fields" });

  const { data, error } = await supabase
    .from("staff")
    .insert([{ name, role, email, phone, org_code }])
    .select();

  if (error) return res.status(400).json(error);
  res.json(data[0]);
});

// =====================================================
// UPDATE STAFF
// =====================================================
router.put("/:id", requireAuth, async (req, res) => {
  const { name, role, email, phone } = req.body;

  const { data, error } = await supabase
    .from("staff")
    .update({ name, role, email, phone })
    .eq("id", req.params.id)
    .select();

  if (error) return res.status(400).json(error);
  res.json(data[0]);
});

// =====================================================
// DELETE STAFF
// =====================================================
router.delete("/:id", requireAuth, async (req, res) => {
  const org_code = getOrg(req);

  const query = supabase
    .from("staff")
    .delete()
    .eq("id", req.params.id);

  if (!isSuperAdmin(req)) {
    query.eq("org_code", org_code);
  }

  const { error } = await query;

  if (error) return res.status(400).json(error);
  res.json({ message: "Staff member deleted" });
});

module.exports = router;
