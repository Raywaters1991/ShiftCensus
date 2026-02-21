// backend/routes/me.js
const express = require("express");
const router = express.Router();

const supabase = require("../supabase");
const supabaseAdmin = require("../supabaseAdmin");

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
  const end = new Date(Date.UTC(y, m, 1));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

async function resolveActiveOrg({ userId, headerOrgCode }) {
  if (headerOrgCode) {
    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("id, org_code, name, logo_url")
      .eq("org_code", headerOrgCode)
      .maybeSingle();

    if (org?.id) return { org, source: "header" };
  }

  const { data: staff } = await supabaseAdmin
    .from("staff")
    .select("id, org_code")
    .eq("user_id", userId)
    .maybeSingle();

  if (staff?.org_code) {
    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("id, org_code, name, logo_url")
      .eq("org_code", staff.org_code)
      .maybeSingle();

    if (org?.id) return { org, source: "staff" };
  }

  return { org: null, source: "none" };
}

router.get("/bootstrap", requireAuth, async (req, res) => {
  try {
    const headerOrgCode = req.get("X-Org-Code") || null;
    const r = await resolveActiveOrg({ userId: req.user.id, headerOrgCode });

    res.json({
      user: { id: req.user.id, email: req.user.email },
      activeOrg: r.org,
      activeOrgSource: r.source,
    });
  } catch (e) {
    console.error("ME BOOTSTRAP ERROR:", e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/home-summary", requireAuth, async (req, res) => {
  try {
    const range = monthRange(req.query.month);
    if (!range) return res.status(400).json({ error: "Invalid month. Use YYYY-MM" });

    const headerOrgCode = req.get("X-Org-Code") || null;
    const resolved = await resolveActiveOrg({ userId: req.user.id, headerOrgCode });
    const org = resolved.org;

    if (!org?.org_code) {
      return res.status(400).json({ error: "No active org found for user" });
    }

    const orgCode = org.org_code;

    const { data: staff } = await supabaseAdmin
      .from("staff")
      .select("id")
      .eq("org_code", orgCode)
      .eq("user_id", req.user.id)
      .maybeSingle();

    const staffId = staff?.id ? String(staff.id) : null;

    // ---------- MY SHIFTS ----------
    let myShifts = [];

    if (staffId) {
      const { data } = await supabaseAdmin
        .from("shifts")
        .select(`
          id,
          org_code,
          staff_id,
          shift_date,
          start_local,
          end_local,
          role,
          status,
          unit
        `)
        .eq("org_code", orgCode)
        .eq("staff_id", staffId)
        .gte("shift_date", range.start)
        .lt("shift_date", range.end)
        .order("shift_date");

      myShifts = (data || []).map((s) => ({
        ...s,
        unit_name: s.unit || null,
      }));
    }

    // ---------- OPEN SHIFTS ----------
    const { data: open } = await supabaseAdmin
      .from("shifts")
      .select(`
        id,
        org_code,
        staff_id,
        shift_date,
        start_local,
        end_local,
        role,
        status,
        unit
      `)
      .eq("org_code", orgCode)
      .is("staff_id", null)
      .gte("shift_date", range.start)
      .lt("shift_date", range.end)
      .order("shift_date");

    const openShifts = (open || []).map((s) => ({
      ...s,
      unit_name: s.unit || null,
    }));

    res.json({
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
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
