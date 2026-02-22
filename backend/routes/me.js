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

/** Read your app-role from public.users (NOT Supabase auth role) */
async function getAppRole(userId) {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) return null;
  const r = String(data?.role || "").toLowerCase();
  return r || null;
}

async function getOrgByCode(orgCode) {
  if (!orgCode) return null;
  const { data, error } = await supabaseAdmin
    .from("orgs")
    .select("id, org_code, name, logo_url")
    .eq("org_code", orgCode)
    .maybeSingle();
  if (error) return null;
  return data?.id ? data : null;
}

async function getOrgById(orgId) {
  if (!orgId) return null;
  const { data, error } = await supabaseAdmin
    .from("orgs")
    .select("id, org_code, name, logo_url")
    .eq("id", orgId)
    .maybeSingle();
  if (error) return null;
  return data?.id ? data : null;
}

async function getFirstNonAdminOrg() {
  const { data, error } = await supabaseAdmin
    .from("orgs")
    .select("id, org_code, name, logo_url")
    .neq("org_code", "ADMIN")
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) return null;
  return data?.[0]?.id ? data[0] : null;
}

/**
 * ✅ NEW: Org-scoped membership permissions for a user in an org
 * Requires columns on org_memberships:
 * - is_admin boolean
 * - can_manage_admins boolean
 * - can_schedule_write boolean
 * - department_id uuid nullable
 */
async function getMembershipPerms(userId, orgId) {
  if (!userId || !orgId) return null;

  const { data, error } = await supabaseAdmin
    .from("org_memberships")
    .select("role, is_admin, can_manage_admins, can_schedule_write, department_id, is_active")
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return null;
  return data?.role ? data : null;
}

/**
 * Resolve active org:
 * - Superadmin: header org_code wins; else first non-ADMIN org (or null)
 * - Normal: membership org; else staff fallback; else null
 */
async function resolveActiveOrg({ userId, headerOrgCode, isSuperadmin }) {
  // SUPERADMIN: can enter ANY org, no membership required
  if (isSuperadmin) {
    if (headerOrgCode) {
      const org = await getOrgByCode(headerOrgCode);
      if (org) return { org, source: "header", membershipRole: "superadmin" };
    }
    const fallback = await getFirstNonAdminOrg();
    if (fallback) return { org: fallback, source: "default", membershipRole: "superadmin" };
    return { org: null, source: "none", membershipRole: "superadmin" };
  }

  // NORMAL USERS: use memberships.
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

  // staff fallback
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("org_code")
    .eq("user_id", userId)
    .maybeSingle();

  if (!staffErr && staff?.org_code) {
    const org = await getOrgByCode(staff.org_code);
    if (org) return { org, source: "staff", membershipRole: null };
  }

  return { org: null, source: "none", membershipRole: null };
}

/**
 * Bootstrap: frontend calls this on login/refresh
 * ✅ NOW RETURNS permissions for active org
 */
router.get("/bootstrap", requireAuth, async (req, res) => {
  try {
    const appRole = await getAppRole(req.user.id);
    const isSuperadmin = String(appRole || "").toLowerCase() === "superadmin";

    const headerOrgCode = req.get("X-Org-Code") || req.get("x-org-code") || null;
    const r = await resolveActiveOrg({ userId: req.user.id, headerOrgCode, isSuperadmin });

    let permissions = null;

    if (r?.org?.id) {
      if (isSuperadmin) {
        permissions = {
          role: "superadmin",
          is_admin: true,
          can_manage_admins: true,
          can_schedule_write: true,
          department_id: null,
          is_active: true,
        };
      } else {
        permissions = await getMembershipPerms(req.user.id, r.org.id);
      }
    }

    return res.json({
      user: { id: req.user.id, email: req.user.email },
      appRole: appRole || null,
      activeOrg: r.org,
      activeOrgSource: r.source,
      membershipRole: r.membershipRole,
      permissions, // ✅ NEW
      isSuperadmin,
    });
  } catch (e) {
    console.error("ME BOOTSTRAP ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

/**
 * Memberships:
 * - Superadmin: return ALL orgs as selectable list (no membership rows needed)
 * - Normal: return real memberships (with permissions)
 */
router.get("/memberships", requireAuth, async (req, res) => {
  try {
    const appRole = await getAppRole(req.user.id);
    const isSuperadmin = String(appRole || "").toLowerCase() === "superadmin";

    if (isSuperadmin) {
      const { data, error } = await supabaseAdmin
        .from("orgs")
        .select("id, org_code, name, logo_url")
        .order("name", { ascending: true });

      if (error) throw error;

      const memberships = (data || [])
        .filter((o) => o?.id && String(o.org_code || "").toUpperCase() !== "ADMIN")
        .map((o) => ({
          role: "superadmin",
          orgs: o,
          permissions: {
            role: "superadmin",
            is_admin: true,
            can_manage_admins: true,
            can_schedule_write: true,
            department_id: null,
            is_active: true,
          },
        }));

      return res.json({ memberships });
    }

    const { data, error } = await supabaseAdmin
      .from("org_memberships")
      .select(
        `
          role,
          is_admin,
          can_manage_admins,
          can_schedule_write,
          department_id,
          orgs:orgs!org_memberships_org_id_fkey (
            id, org_code, name, logo_url
          )
        `
      )
      .eq("user_id", req.user.id)
      .eq("is_active", true);

    if (error) throw error;

    const memberships = (data || [])
      .filter((m) => m?.orgs?.id)
      .map((m) => ({
        role: m.role,
        orgs: m.orgs,
        permissions: {
          role: m.role,
          is_admin: !!m.is_admin,
          can_manage_admins: !!m.can_manage_admins,
          can_schedule_write: !!m.can_schedule_write,
          department_id: m.department_id || null,
          is_active: true,
        },
      }));

    return res.json({ memberships });
  } catch (e) {
    console.error("ME MEMBERSHIPS ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

/**
 * Home summary:
 * Your shifts table columns: unit (text), no status/unit_name.
 * Map unit -> unit_name and shift_date -> date for UI.
 */
router.get("/home-summary", requireAuth, async (req, res) => {
  try {
    const range = monthRange(req.query.month);
    if (!range) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    const appRole = await getAppRole(req.user.id);
    const isSuperadmin = String(appRole || "").toLowerCase() === "superadmin";

    const headerOrgCode = req.get("X-Org-Code") || req.get("x-org-code") || null;
    const resolved = await resolveActiveOrg({ userId: req.user.id, headerOrgCode, isSuperadmin });
    const org = resolved.org;

    if (!org?.org_code) return res.status(400).json({ error: "No active org found for user" });
    const orgCode = org.org_code;

    // Get staff row for this user in this org
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, user_id, org_code, employee_no, staff_uuid")
      .eq("org_code", orgCode)
      .eq("user_id", req.user.id)
      .maybeSingle();
    if (staffErr) throw staffErr;

    const staffId = staff?.id ? String(staff.id) : null;

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
        date: s.shift_date,
        unit_name: s.unit || null,
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
      appRole: appRole || null,
      isSuperadmin,
    });
  } catch (e) {
    console.error("ME HOME SUMMARY ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

module.exports = router;
