// backend/routes/staff.js

const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
function isSuperAdmin(req) {
  return String(req.user?.app_metadata?.role || "").toLowerCase() === "superadmin";
}

async function resolveOrgCode(req) {
  // Prefer explicit org code header
  const orgCodeHeader = req.headers["x-org-code"];
  if (orgCodeHeader) return String(orgCodeHeader).trim();

  // Else resolve via x-org-id
  const orgIdHeader = req.headers["x-org-id"];
  if (!orgIdHeader) return null;

  const orgId = String(orgIdHeader).trim();

  const { data, error } = await supabase
    .from("orgs")
    .select("org_code")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    console.error("ORG RESOLVE ERROR (staff):", error);
    return null;
  }

  return data?.org_code ? String(data.org_code).trim() : null;
}

// =====================================================
// GET STAFF (ORG-SCOPED)
// =====================================================
router.get("/", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);

  if (!orgCode && !isSuperAdmin(req)) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  let query = supabase.from("staff").select("*").order("name");

  if (!isSuperAdmin(req)) {
    query = query.eq("org_code", orgCode);
  }

  const { data, error } = await query;

  if (error) {
    console.error("STAFF GET ERROR:", error);
    return res.status(500).json({ error: "Failed to load staff" });
  }

  res.json(data || []);
});

// =====================================================
// ADD STAFF (ORG-SCOPED)
// =====================================================
router.post("/", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { name, role, email, phone } = req.body;

  if (!name || !role) {
    return res.status(400).json({ error: "Name and role required" });
  }

  const { data, error } = await supabase
    .from("staff")
    .insert([
      {
        name,
        role,
        email: email || null,
        phone: phone || null,
        org_code: orgCode,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("STAFF POST ERROR:", error);
    return res.status(500).json({ error: "Failed to create staff" });
  }

  res.json(data);
});

// =====================================================
// UPDATE STAFF (ORG-SCOPED)
// =====================================================
router.put("/:id", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode && !isSuperAdmin(req)) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { name, role, email, phone } = req.body;

  let query = supabase
    .from("staff")
    .update({
      name,
      role,
      email: email || null,
      phone: phone || null,
    })
    .eq("id", req.params.id);

  if (!isSuperAdmin(req)) {
    query = query.eq("org_code", orgCode);
  }

  const { data, error } = await query.select().single();

  if (error) {
    console.error("STAFF PUT ERROR:", error);
    return res.status(500).json({ error: "Failed to update staff" });
  }

  res.json(data);
});

// =====================================================
// DELETE STAFF (ORG-SCOPED)
// =====================================================
router.delete("/:id", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode && !isSuperAdmin(req)) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  let query = supabase.from("staff").delete().eq("id", req.params.id);

  if (!isSuperAdmin(req)) {
    query = query.eq("org_code", orgCode);
  }

  const { error } = await query;

  if (error) {
    console.error("STAFF DELETE ERROR:", error);
    return res.status(500).json({ error: "Failed to delete staff" });
  }

  res.json({ success: true });
});

module.exports = router;
