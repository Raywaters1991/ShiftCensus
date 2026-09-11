const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth, requireSuperAdmin } = require("../middleware/auth");

router.use(requireAuth);
router.use(requireSuperAdmin);

function clampLimit(v) {
  const n = Number.parseInt(String(v || "100"), 10);
  if (!Number.isFinite(n)) return 100;
  return Math.max(1, Math.min(500, n));
}

router.get("/", async (req, res) => {
  try {
    const limit = clampLimit(req.query?.limit);
    const orgCode = String(req.query?.org_code || "").trim();
    const outcome = String(req.query?.outcome || "").trim();
    const method = String(req.query?.method || "").trim().toUpperCase();

    let q = supabaseAdmin
      .from("security_audit_log")
      .select("id,created_at,org_id,org_code,actor_user_id,actor_email,actor_role,action,method,path,status_code,ip_address,user_agent,duration_ms,metadata")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (orgCode) q = q.eq("org_code", orgCode);
    if (method && ["POST", "PUT", "PATCH", "DELETE"].includes(method)) q = q.eq("method", method);
    if (outcome === "failed") q = q.gte("status_code", 400);
    if (outcome === "success") q = q.lt("status_code", 400);

    const { data, error } = await q;
    if (error) throw error;

    return res.json({ rows: data || [], limit });
  } catch (e) {
    console.error("SECURITY AUDIT LIST ERROR:", e);
    return res.status(500).json({ error: "Failed to load audit log" });
  }
});

module.exports = router;
