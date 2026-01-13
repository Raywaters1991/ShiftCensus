// backend/routes/assignments.js

const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------
async function resolveOrgCode(req) {
  const orgCodeHeader = req.headers["x-org-code"];
  if (orgCodeHeader) return String(orgCodeHeader).trim();

  const orgIdHeader = req.headers["x-org-id"];
  if (!orgIdHeader) return null;

  const orgId = String(orgIdHeader).trim();

  const { data, error } = await supabase
    .from("orgs")
    .select("org_code")
    .eq("id", orgId)
    .maybeSingle();

  if (error) {
    console.error("ORG RESOLVE ERROR (assignments):", error);
    return null;
  }

  return data?.org_code ? String(data.org_code).trim() : null;
}

// =====================================================
// GET assignments (org-scoped)
// =====================================================
router.get("/", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { data, error } = await supabase
    .from("cna_assignments")
    .select("*")
    .eq("org_code", orgCode)
    .order("unit", { ascending: true })
    .order("number", { ascending: true });

  if (error) {
    console.error("ASSIGNMENTS GET ERROR:", error);
    return res.status(500).json({ error: "Failed to load assignments" });
  }

  res.json(data || []);
});

// =====================================================
// CREATE assignment (org-scoped)
// =====================================================
router.post("/", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { unit, number, label } = req.body;

  if (!unit || !number) {
    return res.status(400).json({ error: "Unit and number required" });
  }

  const { data, error } = await supabase
    .from("cna_assignments")
    .insert([
      {
        org_code: orgCode,
        unit,
        number,
        label: label || null,
      },
    ])
    .select()
    .single();

  if (error) {
    console.error("ASSIGNMENTS POST ERROR:", error);
    return res.status(500).json({ error: "Failed to create assignment" });
  }

  res.json(data);
});

// =====================================================
// UPDATE assignment (org-scoped)
// =====================================================
router.put("/:id", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { unit, number, label } = req.body;

  const { data, error } = await supabase
    .from("cna_assignments")
    .update({
      unit,
      number,
      label: label || null,
    })
    .eq("id", req.params.id)
    .eq("org_code", orgCode)
    .select()
    .single();

  if (error) {
    console.error("ASSIGNMENTS PUT ERROR:", error);
    return res.status(500).json({ error: "Failed to update assignment" });
  }

  res.json(data);
});

// =====================================================
// DELETE assignment (org-scoped)
// =====================================================
router.delete("/:id", requireAuth, async (req, res) => {
  const orgCode = await resolveOrgCode(req);
  if (!orgCode) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { error } = await supabase
    .from("cna_assignments")
    .delete()
    .eq("id", req.params.id)
    .eq("org_code", orgCode);

  if (error) {
    console.error("ASSIGNMENTS DELETE ERROR:", error);
    return res.status(500).json({ error: "Failed to delete assignment" });
  }

  res.json({ success: true });
});

module.exports = router;
