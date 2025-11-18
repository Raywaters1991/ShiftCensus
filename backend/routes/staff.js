const express = require('express');
const router = express.Router();
const supabase = require('../supabase');


// =====================================================
// GET ALL STAFF FOR AN ORGANIZATION
// /api/staff?org_code=ABC123
// =====================================================
router.get('/', async (req, res) => {
  const org_code = req.query.org_code;

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .eq('org_code', org_code)
    .order('id');

  if (error) return res.status(400).json(error);

  res.json(data);
});



// =====================================================
// ADD STAFF
// =====================================================
router.post('/', async (req, res) => {
  const { name, role, email, phone, org_code } = req.body;

  if (!org_code) {
    return res.status(400).json({ error: "org_code is required" });
  }

  if (!name || !role) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const { data, error } = await supabase
    .from('staff')
    .insert([{ name, role, email, phone, org_code }])
    .select();

  if (error) return res.status(400).json(error);

  res.json(data[0]);
});



// =====================================================
// UPDATE STAFF MEMBER
// =====================================================
router.put('/:id', async (req, res) => {
  const { name, role, email, phone } = req.body;

  const { data, error } = await supabase
    .from('staff')
    .update({ name, role, email, phone })
    .eq('id', req.params.id)
    .select();

  if (error) return res.status(400).json(error);

  res.json(data[0]);
});



// =====================================================
// DELETE STAFF
// (CASCADE deletes their shifts automatically)
// =====================================================
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('staff')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json(error);

  res.json({ message: "Staff member deleted" });
});



module.exports = router;
