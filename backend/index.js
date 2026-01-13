// backend/index.js
require("dotenv").config();
const express = require("express");
const app = express();
const cors = require("cors");

app.use(express.json());

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-org-id", "x-org-code"],
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
app.use("/api/shift-settings", require("./routes/shiftSettings"));

// ✅ ORG SETTINGS
app.use("/api/org-settings", require("./routes/orgSettings"));

// ✅ FACILITY (rooms/beds)
app.use("/api/facility", require("./routes/facility"));

app.get("/", (req, res) => {
  res.send("ShiftCensus backend running.");
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
