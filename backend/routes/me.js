// backend/routes/me.js
const express = require("express");
const router = express.Router();

const supabase = require("../supabase"); // anon client (auth verification)
const supabaseAdmin = require("../supabaseAdmin"); // service role (DB)

// -------------------------
// Auth helper
// -------------------------
function getBearerToken(req) {
  const h = req.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: "Missing Authorization Bearer token" });

    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid or expired token" });

    req.user = data.user;
    next();
  } catch {
    return res.status(401).json({ error: "Unauthorized" });
  }
}

// -------------------------
// Date helper
// -------------------------
function monthRange(monthKey) {
  const [yStr, mStr] = String(monthKey || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return null;

  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // exclusive
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// -------------------------
// GET /api/me/home-summary
// -------------------------
router.get("/home-summary", requireAuth, async (req, res) => {
  try {
    const orgCode = req.get("X-Org-Code") || req.get("x-org-code") || null;
    if (!orgCode) return res.status(400).json({ error: "Missing X-Org-Code" });

    const range = monthRange(req.query.month);
    if (!range) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    const userId = req.user.id;

    // Find staff row linked to user_id in this org
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, org_code")
      .eq("org_code", orgCode)
      .eq("user_id", userId)
      .maybeSingle();
    if (staffErr) throw staffErr;

    const staffId = staff?.id ? String(staff.id) : null;

    // My shifts (assigned)
    let myShifts = [];
    if (staffId) {
      const { data, error } = await supabaseAdmin
        .from("shifts")
        .select("id, org_code, staff_id, shift_date, start_local, end_local, role, unit_name, status")
        .eq("org_code", orgCode)
        .eq("staff_id", staffId)
        .gte("shift_date", range.start)
        .lt("shift_date", range.end)
        .order("shift_date", { ascending: true });

      if (error) throw error;
      myShifts = data || [];
    }

    // Open shifts (unassigned)
    const { data: openShifts, error: openErr } = await supabaseAdmin
      .from("shifts")
      .select("id, org_code, staff_id, shift_date, start_local, end_local, role, unit_name, status")
      .eq("org_code", orgCode)
      .is("staff_id", null)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end)
      .order("shift_date", { ascending: true });

    if (openErr) throw openErr;

    return res.json({
      myShifts,
      openShifts: openShifts || [],
      pending: [],
      timeOff: [],
      staffId,
    });
  } catch (e) {
    console.error("ME HOME SUMMARY ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

module.exports = router;
