const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

function getOrgCode(req) {
  return req.user?.user_metadata?.org_code || null;
}

router.get("/", requireAuth, async (req, res) => {
  const org = getOrgCode(req);
  if (!org) return res.status(400).json({ error: "Missing org_code" });

  const { data, error } = await supabase
    .from("census")
    .select("*")
    .eq("org_code", org)
    .order("id");

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

router.post("/", requireAuth, async (req, res) => {
  const org = getOrgCode(req);
  if (!org) return res.status(400).json({ error: "Missing org_code" });

  const { room, status, admitDate, expectedDischarge } = req.body;

  const { data, error } = await supabase
    .from("census")
    .insert([
      {
        room,
        status,
        admit_date: admitDate,
        expected_discharge: expectedDischarge,
        org_code: org,
      },
    ])
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

router.put("/:id", requireAuth, async (req, res) => {
  const org = getOrgCode(req);

  const { data, error } = await supabase
    .from("census")
    .update(req.body)
    .eq("id", req.params.id)
    .eq("org_code", org)
    .select();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data[0]);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const org = getOrgCode(req);

  const { error } = await supabase
    .from("census")
    .delete()
    .eq("id", req.params.id)
    .eq("org_code", org);

  if (error) return res.status(400).json({ error: error.message });
  res.json({ message: "Census row deleted" });
});

module.exports = router;
