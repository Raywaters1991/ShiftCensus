const express = require('express');
const router = express.Router();
const supabase = require('../supabase');


// =====================================================
// GET census by organization
// /api/census?org_code=ABC123
// =====================================================
router.get('/', async (req, res) => {
  const org_code = req.query.org_code;

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
// CREATE a census row
// =====================================================
router.post('/', async (req, res) => {
  const { room, status, admitDate, expectedDischarge, org_code } = req.body;

  if (!org_code) {
    return res.status(400).json({ error: "org_code is required" });
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
// UPDATE a census row
// =====================================================
router.put('/:id', async (req, res) => {
  const { room, status, admitDate, expectedDischarge } = req.body;

  const { data, error } = await supabase
    .from('census')
    .update({
      room,
      status,
      admit_date: admitDate,
      expected_discharge: expectedDischarge
    })
    .eq('id', req.params.id)
    .select();

  if (error) return res.status(400).json(error);

  res.json(data[0]);
});



// =====================================================
// DELETE a census row
// =====================================================
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('census')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json(error);

  res.json({ message: "Census row deleted" });
});



module.exports = router;
