const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// Pull org from header
function getOrgCode(req) {
  return req.headers["x-org-code"] || null;
}

// =====================================================
// GET STAFF (for a single organization)
// =====================================================
router.get('/', async (req, res) => {
  const org_code = getOrgCode(req);

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
  const org_code = getOrgCode(req);
  const { name, role, email, phone } = req.body;

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
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
// UPDATE STAFF
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
// =====================================================
router.delete('/:id', async (req, res) => {
  const org_code = getOrgCode(req);

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { error } = await supabase
    .from('staff')
    .delete()
    .eq('id', req.params.id)
    .eq('org_code', org_code); // prevent deleting other org's users

  if (error) return res.status(400).json(error);

  res.json({ message: "Staff member deleted" });
});


module.exports = router;
