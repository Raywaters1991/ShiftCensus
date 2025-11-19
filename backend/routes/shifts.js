const express = require('express');
const router = express.Router();
const supabase = require('../supabase');

// Helper to fetch org from header
function getOrgCode(req) {
  return req.headers["x-org-code"] || null;
}

// ===========================================
// GET SHIFTS (for an organization)
// ===========================================
router.get('/', async (req, res) => {
  const org_code = getOrgCode(req);

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


// ===========================================
// CREATE SHIFT
// ===========================================
router.post('/', async (req, res) => {
  const org_code = getOrgCode(req);
  const { staffId, role, start, end, unit, assignment_number } = req.body;

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  if (!staffId || !role || !start || !end) {
    return res.status(400).json({ error: "Missing required fields" });
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


// ===========================================
// UPDATE SHIFT
// ===========================================
router.put('/:id', async (req, res) => {
  const org_code = getOrgCode(req);
  const { role, start, end, unit, assignment_number } = req.body;

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

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
    .eq('org_code', org_code)  // protect other orgs' shifts
    .select();

  if (error) return res.status(400).json(error);

  res.json(data[0]);
});


// ===========================================
// DELETE SHIFT
// ===========================================
router.delete('/:id', async (req, res) => {
  const org_code = getOrgCode(req);

  if (!org_code) {
    return res.status(400).json({ error: "Missing org_code" });
  }

  const { error } = await supabase
    .from('shifts')
    .delete()
    .eq('id', req.params.id)
    .eq('org_code', org_code);

  if (error) return res.status(400).json(error);

  res.json({ message: "Shift deleted" });
});


module.exports = router;
