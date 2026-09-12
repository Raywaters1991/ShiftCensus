const express = require("express");
const crypto = require("crypto");
const router = express.Router();

const supabase = require("../supabase");
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth, requireSuperAdmin } = require("../middleware/auth");

router.use(requireAuth);
router.use(requireSuperAdmin);

function baseUrl(req) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol || "https").split(",")[0].trim();
  return `${proto}://${req.get("host")}`;
}

async function request(url, token, org, method = "GET", body = undefined, overrideHeaders = {}) {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(org?.id ? { "x-org-id": String(org.id) } : {}),
    ...(org?.org_code ? { "x-org-code": String(org.org_code) } : {}),
    ...overrideHeaders,
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let payload = null;
  try { payload = await response.json(); } catch { payload = null; }
  return { status: response.status, payload };
}

function result(name, actual, expected, detail) {
  return { name, expected_status: expected, actual_status: actual, passed: actual === expected, detail };
}

router.post("/run", async (req, res) => {
  const created = { userId: null };

  try {
    const { data: orgs, error: orgErr } = await supabaseAdmin
      .from("orgs")
      .select("id,org_code,name")
      .order("created_at", { ascending: true })
      .limit(2);

    if (orgErr) throw orgErr;
    if (!Array.isArray(orgs) || orgs.length < 2) {
      return res.status(409).json({ error: "Security self-test requires at least two organizations." });
    }

    const sourceOrg = orgs[0];
    const targetOrg = orgs[1];
    const nonce = crypto.randomUUID().replace(/-/g, "");
    const email = `security-test-${nonce}@shiftcensus.test`;
    const password = `${crypto.randomBytes(24).toString("base64url")}Aa1!`;

    const { data: createdUser, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { security_test: true },
    });
    if (createErr) throw createErr;

    const userId = createdUser?.user?.id;
    if (!userId) throw new Error("Security test user id missing");
    created.userId = userId;

    const { error: profileErr } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      role: "staff",
      org_code: sourceOrg.org_code,
      active_org_id: sourceOrg.id,
    });
    if (profileErr) throw profileErr;

    const { error: membershipErr } = await supabaseAdmin.from("org_memberships").upsert({
      user_id: userId,
      org_id: sourceOrg.id,
      role: "staff",
      is_active: true,
      is_admin: false,
      can_manage_admins: false,
      can_dashboard_read: false,
      can_schedule_read: true,
      can_schedule_write: false,
      can_census_read: true,
      can_census_write: false,
      department_id: null,
      department_locked: false,
    }, { onConflict: "user_id,org_id" });
    if (membershipErr) throw membershipErr;

    const { data: login, error: loginErr } = await supabase.auth.signInWithPassword({ email, password });
    if (loginErr || !login?.session?.access_token) throw loginErr || new Error("Security test login failed");
    const token = login.session.access_token;
    const root = baseUrl(req);
    const testDate = "2026-01-01";
    const tests = [];

    let r = await request(`${root}/api/shifts?date=${testDate}`, token, sourceOrg);
    tests.push(result("Allowed org schedule read", r.status, 200, "Read-only test user may read schedule in its own org."));

    r = await request(`${root}/api/shifts`, token, sourceOrg, "POST", {});
    tests.push(result("Denied schedule write", r.status, 403, "Read-only test user must not create shifts."));

    r = await request(`${root}/api/shift-assignments?date=${testDate}`, token, sourceOrg);
    tests.push(result("Allowed org assignment read", r.status, 200, "Read-only schedule permission may read daily assignments in its own org."));

    r = await request(`${root}/api/staff/lookup`, token, sourceOrg);
    tests.push(result("Allowed scoped staff lookup", r.status, 200, "Schedule readers may load only the lightweight name/role lookup in their own org."));

    r = await request(`${root}/api/operations-snapshot?date=${testDate}`, token, sourceOrg);
    tests.push(result("Allowed scoped operations snapshot", r.status, 200, "Schedule readers may load the compact operations snapshot only for their own organization."));

    r = await request(`${root}/api/dashboard?date=${testDate}`, token, sourceOrg);
    tests.push(result("Denied dashboard without permission", r.status, 403, "Schedule read permission must not implicitly grant dashboard access."));

    r = await request(`${root}/api/census/bed-board`, token, targetOrg);
    tests.push(result("Denied cross-org census read", r.status, 403, "User must not read census from an org without membership."));

    r = await request(`${root}/api/shifts?date=${testDate}`, token, targetOrg);
    tests.push(result("Denied cross-org schedule read", r.status, 403, "User must not read another organization's schedule."));

    r = await request(`${root}/api/shift-assignments?date=${testDate}`, token, targetOrg);
    tests.push(result("Denied cross-org assignment read", r.status, 403, "User must not read another organization's unit assignments."));

    r = await request(`${root}/api/staff/lookup`, token, targetOrg);
    tests.push(result("Denied cross-org staff lookup", r.status, 403, "User must not enumerate staff names or roles in another organization."));

    r = await request(`${root}/api/operations-snapshot?date=${testDate}`, token, targetOrg);
    tests.push(result("Denied cross-org operations snapshot", r.status, 403, "User must not load another organization's cached operations data."));

    r = await request(`${root}/api/dashboard?date=${testDate}`, token, targetOrg);
    tests.push(result("Denied cross-org dashboard read", r.status, 403, "User must not read another organization's dashboard data."));

    r = await request(`${root}/api/shifts?date=${testDate}`, token, sourceOrg, "GET", undefined, {
      "x-org-id": String(sourceOrg.id),
      "x-org-code": String(targetOrg.org_code),
    });
    tests.push(result("Rejected mismatched org headers", r.status, 400, "Allowed org id paired with another org code must be rejected."));

    r = await request(`${root}/api/census/security-probe`, token, sourceOrg, "POST", {});
    tests.push(result("Denied census write", r.status, 403, "Read-only census permission must block all write methods before routing."));

    r = await request(`${root}/api/adminmanagement/list`, token, sourceOrg);
    tests.push(result("Denied admin management", r.status, 403, "Ordinary staff must not access admin-management APIs."));

    r = await request(`${root}/api/org-settings/layout`, token, sourceOrg, "PUT", { room_count: 10, beds_per_room: 2 });
    tests.push(result("Denied facility settings write", r.status, 403, "Ordinary staff must not modify facility/org settings."));

    r = await request(`${root}/api/organizations`, token, null);
    tests.push(result("Denied superadmin organization list", r.status, 403, "Ordinary staff must not enumerate all organizations."));

    r = await request(`${root}/api/security-audit`, token, null);
    tests.push(result("Denied security audit log", r.status, 403, "Only superadmin may read the global security audit log."));

    const passed = tests.filter((t) => t.passed).length;
    const failed = tests.length - passed;

    return res.json({
      ok: failed === 0,
      summary: { total: tests.length, passed, failed },
      source_org: { id: sourceOrg.id, org_code: sourceOrg.org_code, name: sourceOrg.name },
      target_org: { id: targetOrg.id, org_code: targetOrg.org_code, name: targetOrg.name },
      tests,
      note: "A temporary least-privilege user was created for this run and is removed during cleanup.",
    });
  } catch (e) {
    console.error("SECURITY SELF TEST ERROR:", e);
    return res.status(500).json({ error: e?.message || "Security self-test failed" });
  } finally {
    if (created.userId) {
      try { await supabaseAdmin.from("org_memberships").delete().eq("user_id", created.userId); } catch {}
      try { await supabaseAdmin.from("profiles").delete().eq("id", created.userId); } catch {}
      try { await supabaseAdmin.auth.admin.deleteUser(created.userId); } catch {}
    }
  }
});

module.exports = router;
