const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET all shifts
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .order('id');

  if (error) return res.status(400).json(error);
  res.json(data);
});

// CREATE shift
router.post('/', async (req, res) => {
  const { staffId, role, start, end, unit, assignment_number } = req.body;

  const { data, error } = await supabase
    .from('shifts')
    .insert([
      {
        staff_id: staffId,
        role,
        start_time: start,
        end_time: end,
        unit,
        assignment_number
      }
    ])
    .select();

  if (error) return res.status(400).json(error);
  res.json(data[0]);
});

// UPDATE shift
router.put('/:id', async (req, res) => {
  const { staffId, role, start, end, unit, assignment_number } = req.body;

  const { data, error } = await supabase
    .from('shifts')
    .update({
      staff_id: staffId,
      role,
      start_time: start,
      end_time: end,
      unit,
      assignment_number
    })
    .eq('id', req.params.id)
    .select();

  if (error) return res.status(400).json(error);
  res.json(data[0]);
});

// DELETE shift
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json(error);
  res.json({ message: "Shift deleted" });
});

module.exports = router;
