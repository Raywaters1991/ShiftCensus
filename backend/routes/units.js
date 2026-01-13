// backend/routes/units.js

const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// -----------------------------------------------------
// ORG CONTEXT — FROM HEADER (NOT AUTH METADATA)
// -----------------------------------------------------
function getOrg(req) {
  return req.headers["x-org-code"] || null;
}

function isSuperAdmin(req) {
  return req.user?.app_metadata?.role === "superadmin";
}

// -------------------------------------------------------------
// GET — all units for active org
// -------------------------------------------------------------
router.get("/", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);

    if (!org && !isSuperAdmin(req)) {
      return res.status(400).json({ error: "Missing org context" });
    }

    let query = supabase.from("units").select("*").order("name");

    if (!isSuperAdmin(req)) {
      query = query.eq("org_code", org);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json(data || []);
  } catch (err) {
    console.error("UNITS GET ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// POST — create unit in active org
// -------------------------------------------------------------
router.post("/", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    const { name } = req.body;

    if (!org && !isSuperAdmin(req)) {
      return res.status(400).json({ error: "Missing org context" });
    }

    if (!name) {
      return res.status(400).json({ error: "Unit name required" });
    }

    const { data, error } = await supabase
      .from("units")
      .insert([{ name, org_code: org }])
      .select();

    if (error) throw error;

    res.json(data[0]);
  } catch (err) {
    console.error("UNITS POST ERROR:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// -------------------------------------------------------------
// PUT — update unit (ORG SAFE)
// -------------------------------------------------------------
router.put("/:id", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);
    const { name } = req.body;

    let query = supabase
      .from("units")
      .update({ name })
      .eq("id", req.params.id);

    if (!isSuperAdmin(req)) {
      query = query.eq("org_code", org);
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
// DELETE — remove unit (ORG SAFE)
// -------------------------------------------------------------
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const org = getOrg(req);

    let query = supabase.from("units").delete().eq("id", req.params.id);

    if (!isSuperAdmin(req)) {
      query = query.eq("org_code", org);
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
