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

async function resolveActiveOrg({ userId, headerOrgCode }) {
  // 0) If client explicitly provides org, trust it (superadmin switching orgs, etc.)
  if (headerOrgCode) {
    const { data: org, error } = await supabaseAdmin
      .from("orgs")
      .select("id, org_code, name, logo_url")
      .eq("org_code", headerOrgCode)
      .maybeSingle();

    if (!error && org?.id) return { org, source: "header", membershipRole: null };
  }

  // 1) Try org_memberships
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

  // 2) Fallback: staff link
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

// Frontend can call this to learn org context (and then your UserContext can store it)
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

router.get("/home-summary", requireAuth, async (req, res) => {
  try {
    const range = monthRange(req.query.month);
    if (!range) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    const headerOrgCode = req.get("X-Org-Code") || req.get("x-org-code") || null;
    const resolved = await resolveActiveOrg({ userId: req.user.id, headerOrgCode });
    const org = resolved.org;

    if (!org?.org_code) {
      return res.status(400).json({ error: "No active org found for user" });
    }

    const orgCode = org.org_code;

    // staff row for this user (optional but useful)
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, org_code")
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
          shift_date,
          start_local,
          end_local,
          role,
          status,
          unit_id,
          units:units ( name )
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
        unit_name: s?.units?.name || null,
        units: undefined,
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
        shift_date,
        start_local,
        end_local,
        role,
        status,
        unit_id,
        units:units ( name )
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
      unit_name: s?.units?.name || null,
      units: undefined,
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
