const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
const staffRoutes = require('./routes/staff');
app.use('/api/staff', staffRoutes);
const shiftRoutes = require('./routes/shifts');
app.use('/api/shifts', shiftRoutes);
const censusRoutes = require('./routes/census');
app.use('/api/census', censusRoutes);




// Test route
app.get('/', (req, res) => {
  res.json({ message: "ShiftCensus Backend Running" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`ShiftCensus API running on port ${PORT}`);
});
