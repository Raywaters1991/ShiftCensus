// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// ✅ CORS must run BEFORE routes
const corsOptions = {
  origin: "http://localhost:5173",
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-org-id", "x-org-code"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// ✅ Express 5: "*" route crashes — use regex instead
app.options(/.*/, cors(corsOptions));

app.use(express.json());

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
app.use("/api/invites", require("./routes/invites"));
app.use("/api/departments", require("./routes/departments"));
app.use("/api/org-settings", require("./routes/orgSettings"));
app.use("/api/facility", require("./routes/facility"));

app.get("/", (_req, res) => res.send("ShiftCensus backend running."));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
