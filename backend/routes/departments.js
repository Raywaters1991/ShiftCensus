// backend/routes/departments.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");
const { requireScheduleAccess } = require("../middleware/scheduleAccess");

router.use(requireAuth);
router.use(requireOrg);
router.use(requireScheduleAccess);

function canManage(req) {
  return String(req.role || "").toLowerCase() === "superadmin" || !!req.schedulePermissions?.canWrite;
}

router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { data, error } = await supabaseAdmin.from("departments").select("*").eq("org_code",orgCode).order("name");
    if (error) return res.status(500).json({ error: "Failed to load departments" });
    res.json(data || []);
  } catch (e) {
    console.error("DEPARTMENTS GET ERROR:", e);
    res.status(500).json({ error: "Failed to load departments" });
  }
});

router.post("/", async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: "Not allowed" });
    const orgCode = req.orgCode || req.org_code;
    const name = String(req.body?.name || "").trim();
    if (!name) return res.status(400).json({ error: "Name required" });
    const { data, error } = await supabaseAdmin.from("departments").insert([{org_code:orgCode,name}]).select().single();
    if (error) return res.status(500).json({ error: "Failed to create department" });
    res.json(data);
  } catch (e) {
    console.error("DEPARTMENTS POST ERROR:", e);
    res.status(500).json({ error: "Failed to create department" });
  }
});

module.exports = router;
