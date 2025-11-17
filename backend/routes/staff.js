const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET ALL STAFF
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('staff')
    .select('*')
    .order('id');

  if (error) return res.status(400).json(error);
  res.json(data);
});

// ADD STAFF
router.post('/', async (req, res) => {
  const { name, role, email, phone } = req.body;

  const { data, error } = await supabase
    .from('staff')
    .insert([{ name, role, email, phone }])
    .select();

  if (error) return res.status(400).json(error);
  res.json(data[0]);
});

// UPDATE STAFF
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

// DELETE STAFF
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('staff')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json(error);
  res.json({ message: "Deleted" });
});

module.exports = router;
