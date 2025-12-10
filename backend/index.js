// backend/index.js

require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");

// JSON parser
app.use(express.json());

// GLOBAL CORS
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-org-code"],
  })
);

// ROUTES
app.use("/api/units", require("./routes/units"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/census", require("./routes/census"));
app.use("/api/shifts", require("./routes/shifts"));
app.use("/api/staff", require("./routes/staff"));
app.use("/api/organizations", require("./routes/organizations"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/templates", require("./routes/templates"));



// ⭐ ADD THIS LINE ⭐
app.use("/api/shift-settings", require("./routes/shiftSettings"));

// DEFAULT
app.get("/", (req, res) => {
  res.send("ShiftCensus backend running.");
});

// START SERVER
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
