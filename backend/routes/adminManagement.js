const express = require("express");
const router = express.Router();

const supabase = require("../supabase"); // anon (auth verify)
const supabaseAdmin = require("../supabaseAdmin"); // service role

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

/**
 * Global role (superadmin lives here)
 * Assumes you have a profiles table with: user_id uuid, role text
 * If your column names differ, tell me and I’ll adjust.
 */
async function getGlobalRole(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return null;
  return data?.role || null;
}

/**
 * Active org resolver:
 * - prefer X-Org-Code (header)
 * - else first active membership org
 * - else staff.user_id -> staff.org_code
 */
async function resolveActiveOrg({ userId, headerOrgCode }) {
  if (headerOrgCode) {
    const { data: org, error } = await supabaseAdmin
      .from("orgs")
      .select("id, org_code, name, logo_url")
      .eq("org_code", headerOrgCode)
      .maybeSingle();
    if (!error && org?.id) return { org, source: "header" };
  }

  const { data: memberships, error: memErr } = await supabaseAdmin
    .from("org_memberships")
    .select(
      `
      orgs:orgs!org_memberships_org_id_fkey (
        id, org_code, name, logo_url
      )
    `
    )
    .eq("user_id", userId)
    .eq("is_active", true);

  if (!memErr && Array.isArray(memberships) && memberships.length > 0) {
    const m = memberships.find((x) => x?.orgs?.id) || null;
    if (m?.orgs?.id) return { org: m.orgs, source: "membership" };
  }

  const { data: staff, error: staffErr } = await supabaseAdmin
    .from("staff")
    .select("org_code, user_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!staffErr && staff?.org_code) {
    const { data: org, error: orgErr } = await supabaseAdmin
      .from("orgs")
      .select("id, org_code, name, logo_url")
      .eq("org_code", staff.org_code)
      .maybeSingle();

    if (!orgErr && org?.id) return { org, source: "staff" };
  }

  return { org: null, source: "none" };
}

function toBool(v) {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (v === false || v === "false" || v === 0 || v === "0") return false;
  return null;
}

/**
 * Authorization:
 * - superadmin: always allowed
 * - else must have can_manage_admins=true in THIS org
 */
async function requireCanManageAdmins(req, res, next) {
  try {
    const globalRole = await getGlobalRole(req.user.id);
    if (String(globalRole || "").toLowerCase() === "superadmin") {
      req.globalRole = "superadmin";
      return next();
    }

    const headerOrgCode = req.get("X-Org-Code") || req.get("x-org-code") || null;
    const resolved = await resolveActiveOrg({ userId: req.user.id, headerOrgCode });
    if (!resolved?.org?.id) return res.status(400).json({ error: "No active org selected" });

    const { data: myMembership, error } = await supabaseAdmin
      .from("org_memberships")
      .select("id, can_manage_admins, is_admin, can_schedule_write, role, is_active")
      .eq("user_id", req.user.id)
      .eq("org_id", resolved.org.id)
      .eq("is_active", true)
      .maybeSingle();

    if (error) throw error;

    if (!myMembership?.can_manage_admins) {
      return res.status(403).json({ error: "Forbidden: missing can_manage_admins" });
    }

    req.activeOrg = resolved.org;
    req.myMembership = myMembership;
    req.globalRole = globalRole;
    next();
  } catch (e) {
    console.error("ADMIN AUTH ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
}

/**
 * GET /api/admin-memberships/list
 * List org memberships for the selected org (X-Org-Code)
 */
router.get("/list", requireAuth, requireCanManageAdmins, async (req, res) => {
  try {
    const org = req.activeOrg;

    const { data, error } = await supabaseAdmin
      .from("org_memberships")
      .select(
        `
        id,
        user_id,
        role,
        is_active,
        is_admin,
        can_manage_admins,
        can_schedule_write,
        department_id,
        created_at
      `
      )
      .eq("org_id", org.id)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Optional: attach staff names (if you store staff.user_id)
    const userIds = Array.from(new Set((data || []).map((m) => m.user_id).filter(Boolean)));

    let staffMap = {};
    if (userIds.length) {
      const { data: staffRows, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("id, user_id, name, role, org_code")
        .eq("org_code", org.org_code)
        .in("user_id", userIds);

      if (!staffErr && Array.isArray(staffRows)) {
        staffRows.forEach((s) => {
          if (s?.user_id) staffMap[s.user_id] = s;
        });
      }
    }

    const rows = (data || []).map((m) => ({
      ...m,
      staff_name: staffMap[m.user_id]?.name || null,
      staff_role: staffMap[m.user_id]?.role || null,
      staff_id: staffMap[m.user_id]?.id || null,
    }));

    return res.json({ org, memberships: rows });
  } catch (e) {
    console.error("ADMIN MEMBERSHIPS LIST ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

/**
 * PATCH /api/admin-memberships/:id
 * Body may include:
 * - is_admin, can_manage_admins, can_schedule_write, department_id, is_active, role
 */
router.patch("/:id", requireAuth, requireCanManageAdmins, async (req, res) => {
  try {
    const org = req.activeOrg;
    const id = req.params.id;

    // Load membership (must belong to this org)
    const { data: m, error: mErr } = await supabaseAdmin
      .from("org_memberships")
      .select("*")
      .eq("id", id)
      .eq("org_id", org.id)
      .maybeSingle();
    if (mErr) throw mErr;
    if (!m?.id) return res.status(404).json({ error: "Membership not found for this org" });

    // Prevent self-lockout: you cannot remove your own can_manage_admins
    if (String(m.user_id) === String(req.user.id)) {
      const wantsRemove = toBool(req.body?.can_manage_admins);
      if (wantsRemove === false) {
        return res.status(400).json({ error: "You cannot remove your own can_manage_admins" });
      }
    }

    const patch = {};

    const b1 = toBool(req.body?.is_admin);
    const b2 = toBool(req.body?.can_manage_admins);
    const b3 = toBool(req.body?.can_schedule_write);
    const b4 = toBool(req.body?.is_active);

    if (b1 !== null) patch.is_admin = b1;
    if (b2 !== null) patch.can_manage_admins = b2;
    if (b3 !== null) patch.can_schedule_write = b3;
    if (b4 !== null) patch.is_active = b4;

    if (req.body?.department_id === null || req.body?.department_id === "") patch.department_id = null;
    else if (req.body?.department_id) patch.department_id = req.body.department_id;

    if (typeof req.body?.role === "string" && req.body.role.trim()) {
      patch.role = req.body.role.trim();
    }

    // Helpful rule: if user is_admin=false then can_manage_admins should be false too
    if (patch.is_admin === false) patch.can_manage_admins = false;

    const { data: updated, error: updErr } = await supabaseAdmin
      .from("org_memberships")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    if (updErr) throw updErr;

    return res.json({ ok: true, membership: updated });
  } catch (e) {
    console.error("ADMIN MEMBERSHIPS PATCH ERROR:", e);
    return res.status(500).json({ error: e?.message || "Server error" });
  }
});

module.exports = router;
