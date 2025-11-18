const express = require('express');
const router = express.Router();
const supabase = require('../supabase');


// =========================
// GET all shifts by org_code
// /api/shifts?org_code=ABC123
// =========================
router.get('/', async (req, res) => {
  const org_code = req.query.org_code;

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { data, error } = await supabase
    .from('shifts')
    .select('*')
    .eq('org_code', org_code)
    .order('id');

  if (error) return res.status(400).json(error);
  res.json(data);
});



// ============================
// CREATE NEW SHIFT
// ============================
router.post('/', async (req, res) => {
  const { staffId, role, start, end, unit, assignment_number, org_code } = req.body;

  if (!org_code) {
    return res.status(400).json({ error: "org_code required" });
  }

  const { data, error } = await supabase
    .from('shifts')
    .insert([
      {
        staff_id: staffId,
        role,
        start_time: start,
        end_time: end,
        unit,
        assignment_number,
        org_code
      }
    ])
    .select();

  if (error) return res.status(400).json(error);
  res.json(data[0]);
});



// ============================
// UPDATE SHIFT
// ============================
router.put('/:id', async (req, res) => {
  const { role, start, end, unit, assignment_number } = req.body;

  const { data, error } = await supabase
    .from('shifts')
    .update({
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



// ============================
// DELETE SHIFT
// ============================
router.delete('/:id', async (req, res) => {
  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', req.params.id);

  if (error) return res.status(400).json(error);

  res.json({ message: "Shift deleted" });
});



module.exports = router;
