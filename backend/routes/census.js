const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// GET full census list
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('census')
    .select('*')
    .order('id');

  if (error) return res.status(400).json(error);
  res.json(data);
});

// POST add census row or room update
router.post('/', async (req, res) => {
  const { room, status, admitDate, expectedDischarge } = req.body;

  const { data, error } = await supabase
    .from('census')
    .insert([
      {
        room,
        status,
        admit_date: admitDate,
        expected_discharge: expectedDischarge
      }
    ])
    .select();

  if (error) return res.status(400).json(error);
  res.json(data[0]);
});

module.exports = router;
