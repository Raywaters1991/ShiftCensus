// backend/routes/me.js
const express = require("express");
const router = express.Router();

const supabase = require("../supabase"); // anon client (auth verification)
const supabaseAdmin = require("../supabaseAdmin"); // service role (DB)

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

function monthRange(monthKey) {
  const [yStr, mStr] = String(monthKey || "").split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!y || !m) return null;

  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1)); // exclusive
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

/**
 * Resolve org context in this priority order:
 * 1) Explicit header (X-Org-Code)
 * 2) Explicit query (org_code)
 * 3) If user has exactly one org_membership -> use it
 * Otherwise: return null (caller can 400 with helpful message)
 */
async function resolveOrg(req) {
  let orgCode =
    req.get("X-Org-Code") ||
    req.get("x-org-code") ||
    req.query.org_code ||
    null;

  // If provided, try to also grab org_id (nice to have)
  let orgId =
    req.get("X-Org-Id") ||
    req.get("x-org-id") ||
    req.query.org_id ||
    null;

  if (orgCode && orgId) return { orgCode, orgId, source: "explicit" };

  // infer from org_memberships if orgCode missing
  if (!orgCode) {
    const { data: mems, error } = await supabaseAdmin
      .from("org_memberships")
      .select("org_id, org_code")
      .eq("user_id", req.user.id);

    if (error) throw error;

    if (Array.isArray(mems) && mems.length === 1) {
      orgCode = mems[0].org_code || null;
      orgId = mems[0].org_id || null;
      return { orgCode, orgId, source: "membership_single" };
    }

    return { orgCode: null, orgId: null, source: "missing_or_multi" };
  }

  // orgCode provided but orgId missing — try lookup
  if (orgCode && !orgId) {
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .select("id, org_code")
      .eq("org_code", orgCode)
      .maybeSingle();

    if (!error && org?.id) orgId = org.id;
  }

  return { orgCode, orgId, source: "explicit_partial" };
}

/**
 * Bootstrap endpoint:
 * - returns memberships
 * - returns inferred "active" org if only one
 * - returns staff row for that org (if resolvable)
 *
 * Frontend calls this right after login if no org is stored yet.
 */
router.get("/bootstrap", requireAuth, async (req, res) => {
  try {
    const { data: memberships, error: memErr } = await supabaseAdmin
      .from("org_memberships")
      .select("org_id, org_code, role")
      .eq("user_id", req.user.id)
      .order("org_code", { ascending: true });

    if (memErr) throw memErr;

    // infer active org if exactly one
    const active =
      Array.isArray(memberships) && memberships.length === 1
        ? { org_id: memberships[0].org_id, org_code: memberships[0].org_code }
        : null;

    let staff = null;
    if (active?.org_code) {
      const { data: staffRow, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("id, name, role, email, phone, org_code, user_id")
        .eq("org_code", active.org_code)
        .eq("user_id", req.user.id)
        .maybeSingle();

      if (staffErr) throw staffErr;
      staff = staffRow || null;
    }

    res.json({
      user: { id: req.user.id, email: req.user.email },
      memberships: memberships || [],
      activeOrg: active,
      staff,
    });
  } catch (e) {
    console.error("ME BOOTSTRAP ERROR:", e);
    res.status(500).json({ error: e?.message || "Server error" });
  }
});

router.get("/home-summary", requireAuth, async (req, res) => {
  try {
    const range = monthRange(req.query.month);
    if (!range) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    const { orgCode } = await resolveOrg(req);

    if (!orgCode) {
      return res.status(400).json({
        error:
          "Missing org context. Set X-Org-Code (or choose an org). If user has exactly one org_membership, it will auto-select.",
      });
    }

    // Link user -> staff row (per org)
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, org_code")
      .eq("org_code", orgCode)
      .eq("user_id", req.user.id)
      .maybeSingle();

    if (staffErr) throw staffErr;

    const staffId = staff?.id ? String(staff.id) : null;

    // My shifts
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

    // Open shifts
    const { data: open, error: openErr } = await supabaseAdmin
      .from("shifts")
      .select("id, org_code, staff_id, shift_date, start_local, end_local, role, unit_name, status")
      .eq("org_code", orgCode)
      .is("staff_id", null)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end)
      .order("shift_date", { ascending: true });

    if (openErr) throw openErr;

    res.json({
      myShifts,
      openShifts: open || [],
      pending: [],
      timeOff: [],
      staffId: staffId || null,
      orgCode,
    });
  } catch (e) {
    console.error("ME HOME SUMMARY ERROR:", e);
    res.status(500).json({ error: e?.message || "Server error" });
  }
});

module.exports = router;
