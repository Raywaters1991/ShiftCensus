const express = require('express');
const router = express.Router();
const supabase = require('../supabase');


// Helper: Retrieve org code from headers
function getOrgCode(req) {
  return req.headers["x-org-code"] || null;
}


// =====================================================
// GET census by organization
// =====================================================
router.get('/', async (req, res) => {
  const org_code = getOrgCode(req);

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { data, error } = await supabase
    .from('census')
    .select('*')
    .eq('org_code', org_code)
    .order('id');

  if (error) return res.status(400).json(error);

  res.json(data);
});


// =====================================================
// CREATE census row
// =====================================================
router.post('/', async (req, res) => {
  const org_code = getOrgCode(req);
  const { room, status, admitDate, expectedDischarge } = req.body;

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  if (!room || !status) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { data, error } = await supabase
    .from('census')
    .insert([
      {
        room,
        status,
        admit_date: admitDate,
        expected_discharge: expectedDischarge,
        org_code
      }
    ])
    .select();

  if (error) return res.status(400).json(error);

  res.json(data[0]);
});


// =====================================================
// UPDATE census row
// =====================================================
router.put('/:id', async (req, res) => {
  const org_code = getOrgCode(req);
  const { room, status, admitDate, expectedDischarge } = req.body;

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { data, error } = await supabase
    .from('census')
    .update({
      room,
      status,
      admit_date: admitDate,
      expected_discharge: expectedDischarge
    })
    .eq('id', req.params.id)
    .eq('org_code', org_code) // Prevent editing another org’s data
    .select();

  if (error) return res.status(400).json(error);

  res.json(data[0]);
});


// =====================================================
// DELETE census row
// =====================================================
router.delete('/:id', async (req, res) => {
  const org_code = getOrgCode(req);

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { error } = await supabase
    .from('census')
    .delete()
    .eq('id', req.params.id)
    .eq('org_code', org_code);

  if (error) return res.status(400).json(error);

  res.json({ message: "Census row deleted" });
});


module.exports = router;
