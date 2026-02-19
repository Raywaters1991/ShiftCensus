// backend/routes/assignments.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

// =====================================================
// GET assignments (org-scoped)
// =====================================================
router.get("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    const { data, error } = await supabaseAdmin
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
  } catch (e) {
    console.error("ASSIGNMENTS GET ERROR:", e);
    res.status(500).json({ error: "Failed to load assignments" });
  }
});

// =====================================================
// CREATE assignment (org-scoped)
// =====================================================
router.post("/", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { unit, number, label } = req.body || {};

    if (!unit || !number) return res.status(400).json({ error: "Unit and number required" });

    const { data, error } = await supabaseAdmin
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
  } catch (e) {
    console.error("ASSIGNMENTS POST ERROR:", e);
    res.status(500).json({ error: "Failed to create assignment" });
  }
});

// =====================================================
// UPDATE assignment (org-scoped)
// =====================================================
router.put("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;
    const { unit, number, label } = req.body || {};

    const { data, error } = await supabaseAdmin
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
  } catch (e) {
    console.error("ASSIGNMENTS PUT ERROR:", e);
    res.status(500).json({ error: "Failed to update assignment" });
  }
});

// =====================================================
// DELETE assignment (org-scoped)
// =====================================================
router.delete("/:id", async (req, res) => {
  try {
    const orgCode = req.orgCode || req.org_code;

    const { error } = await supabaseAdmin
      .from("cna_assignments")
      .delete()
      .eq("id", req.params.id)
      .eq("org_code", orgCode);

    if (error) {
      console.error("ASSIGNMENTS DELETE ERROR:", error);
      return res.status(500).json({ error: "Failed to delete assignment" });
    }

    res.json({ success: true });
  } catch (e) {
    console.error("ASSIGNMENTS DELETE ERROR:", e);
    res.status(500).json({ error: "Failed to delete assignment" });
  }
});

module.exports = router;
