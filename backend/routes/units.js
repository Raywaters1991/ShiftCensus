// backend/routes/units.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// -----------------------------------------------------
// ORG CONTEXT — FROM HEADER
// -----------------------------------------------------
function getOrgCode(req) {
  const v = req.headers["x-org-code"];
  return v ? String(v).trim() : null;
}

function isSuperAdmin(req) {
  return String(req.role || "").toLowerCase() === "superadmin";
}

// -------------------------------------------------------------
// GET — all units (org-scoped unless superadmin w/out org header)
// -------------------------------------------------------------
router.get("/", requireAuth, async (req, res) => {
  try {
    const orgCode = getOrgCode(req);

    let query = supabase.from("units").select("*").order("name");

    // Normal users must have org context
    if (!orgCode && !isSuperAdmin(req)) {
      return res.status(400).json({ error: "Missing org context (x-org-code)" });
    }

    // If orgCode is provided, always scope to it (even for superadmin)
    if (orgCode) query = query.eq("org_code", orgCode);

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("UNITS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// POST — create unit (always requires org_code)
// -------------------------------------------------------------
router.post("/", requireAuth, async (req, res) => {
  try {
    const orgCode = getOrgCode(req);
    const { name } = req.body;

    if (!orgCode) {
      return res.status(400).json({ error: "Missing org context (x-org-code)" });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Unit name required" });
    }

    const { data, error } = await supabase
      .from("units")
      .insert([{ name: String(name).trim(), org_code: orgCode }])
      .select();

    if (error) throw error;
    res.json(data?.[0] || null);
  } catch (err) {
    console.error("UNITS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// PUT — update unit (org safe)
// -------------------------------------------------------------
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const orgCode = getOrgCode(req);
    const { name } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Unit name required" });
    }

    let query = supabase
      .from("units")
      .update({ name: String(name).trim() })
      .eq("id", req.params.id);

    // If orgCode header is present, scope to it (recommended)
    // If not present, only superadmin is allowed to update by id alone
    if (orgCode) query = query.eq("org_code", orgCode);
    else if (!isSuperAdmin(req)) {
      return res.status(400).json({ error: "Missing org context (x-org-code)" });
    }

    const { data, error } = await query.select();
    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(403).json({ error: "Not authorized" });
    }

    res.json(data[0]);
  } catch (err) {
    console.error("UNITS PUT ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// DELETE — remove unit (org safe)
// -------------------------------------------------------------
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const orgCode = getOrgCode(req);

    let query = supabase.from("units").delete().eq("id", req.params.id);

    if (orgCode) query = query.eq("org_code", orgCode);
    else if (!isSuperAdmin(req)) {
      return res.status(400).json({ error: "Missing org context (x-org-code)" });
    }

    const { error } = await query;
    if (error) throw error;

    res.json({ message: "Unit deleted" });
  } catch (err) {
    console.error("UNITS DELETE ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
