// backend/routes/me.js
const express = require("express");
const router = express.Router();

const supabase = require("../supabase"); // anon client (auth verification)
const supabaseAdmin = require("../supabaseAdmin"); // service role (DB reads)

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
 * Resolve active org in this priority:
 * 0) X-Org-Code header (if client already selected org)
 * 1) org_memberships (service role)
 * 2) staff.user_id -> staff.org_code fallback (service role)
 */
async function resolveActiveOrg({ userId, headerOrgCode }) {
  // 0) Header org_code (trusted if valid)
  // 0) Header org_code (trusted if valid)
if (headerOrgCode) {
  const { data: org, error } = await supabaseAdmin
    .from("orgs")
    .select("id, org_code, name, logo_url")
    .eq("org_code", headerOrgCode)
    .maybeSingle();

  if (!error && org?.id) {
    // ALSO fetch membership role for this org (if any)
    const { data: mem, error: memErr } = await supabaseAdmin
      .from("org_memberships")
      .select("role")
      .eq("user_id", userId)
      .eq("org_id", org.id)
      .eq("is_active", true)
      .maybeSingle();

    const membershipRole = !memErr ? (mem?.role || null) : null;

    return { org, source: "header", membershipRole };
  }
}

  // 1) Memberships
  const { data: memberships, error: memErr } = await supabaseAdmin
    .from("org_memberships")
    .select(
      `
        role,
        orgs:orgs!org_memberships_org_id_fkey (
          id,
          org_code,
          name,
          logo_url
        )
      `
    )
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!memErr && Array.isArray(memberships) && memberships.length > 0) {
    const m = memberships.find((x) => x?.orgs?.id) || null;
    if (m?.orgs?.id) return { org: m.orgs, source: "membership", membershipRole: m.role || null };
  }

  // 2) Staff link fallback
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("id, org_code, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!staffErr && staff?.org_code) {
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("orgs")
      .select("id, org_code, name, logo_url")
      .eq("org_code", staff.org_code)
      .maybeSingle();

    if (!orgErr && org?.id) return { org, source: "staff", membershipRole: null };
  }

  return { org: null, source: "none", membershipRole: null };
}

/**
 * Frontend calls this on login to learn:
 * - user identity
 * - active org (resolved)
 * - membershipRole (if any)
 */
router.get("/bootstrap", requireAuth, async (req, res) => {
  try {
    const headerOrgCode = req.get("X-Org-Code") || req.get("x-org-code") || null;
    const r = await resolveActiveOrg({ userId: req.user.id, headerOrgCode });

    return res.json({
      user: { id: req.user.id, email: req.user.email },
      activeOrg: r.org,
      activeOrgSource: r.source,
      membershipRole: r.membershipRole,
    });
  } catch (e) {
    console.error("ME BOOTSTRAP ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

/**
 * Optional but recommended: let frontend fetch memberships via backend
 * so you never fight RLS on org_memberships.
 */
router.get("/memberships", requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from("org_memberships")
      .select(
        `
        role,
        orgs:orgs!org_memberships_org_id_fkey (
          id, org_code, name, logo_url
        )
      `
      )
      .eq("user_id", req.user.id)
      .eq("is_active", true);

    if (error) throw error;

    const memberships = (data || []).filter((m) => m?.orgs?.id);
    return res.json({ memberships });
  } catch (e) {
    console.error("ME MEMBERSHIPS ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

/**
 * Home summary for UserHomePage
 * IMPORTANT: Your shifts table has `unit` (text) and does NOT have `unit_name` or `status`.
 * So we select columns that exist and map `unit` -> `unit_name` for the UI.
 */
router.get("/home-summary", requireAuth, async (req, res) => {
  try {
    const range = monthRange(req.query.month);
    if (!range) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    const headerOrgCode = req.get("X-Org-Code") || req.get("x-org-code") || null;
    const resolved = await resolveActiveOrg({ userId: req.user.id, headerOrgCode });
    const org = resolved.org;

    if (!org?.org_code) return res.status(400).json({ error: "No active org found for user" });
    const orgCode = org.org_code;

    // Find staff row linked to logged-in user (in this org)
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, org_code, employee_no, staff_uuid")
      .eq("org_code", orgCode)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (staffErr) throw staffErr;

    const staffId = staff?.id ? String(staff.id) : null;

    // My shifts (assigned)
    let myShifts = [];
    if (staffId) {
      const { data, error } = await supabaseAdmin
        .from("shifts")
        .select(
          `
            id,
            org_code,
            staff_id,
            staff_uuid,
            role,
            shift_date,
            start_local,
            end_local,
            timezone,
            shift_type,
            unit
          `
        )
        .eq("org_code", orgCode)
        .eq("staff_id", staffId)
        .gte("shift_date", range.start)
        .lt("shift_date", range.end)
        .order("shift_date", { ascending: true });

      if (error) throw error;

     myShifts = (data || []).map((s) => ({
  ...s,
  date: s.shift_date,            // ✅ calendar uses this first
  unit_name: s.unit || null,      // ✅ UI expects unit_name
}));
    }

    // Open shifts (unassigned)
    const { data: open, error: openErr } = await supabaseAdmin
      .from("shifts")
      .select(
        `
          id,
          org_code,
          staff_id,
          staff_uuid,
          role,
          shift_date,
          start_local,
          end_local,
          timezone,
          shift_type,
          unit
        `
      )
      .eq("org_code", orgCode)
      .is("staff_id", null)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end)
      .order("shift_date", { ascending: true });

    if (openErr) throw openErr;

    const openShifts = (open || []).map((s) => ({
  ...s,
  date: s.shift_date,
  unit_name: s.unit || null,
}));

    return res.json({
      myShifts,
      openShifts,
      pending: [],
      timeOff: [],
      staffId,
      activeOrg: org,
      activeOrgSource: resolved.source,
    });
  } catch (e) {
    console.error("ME HOME SUMMARY ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

module.exports = router;
