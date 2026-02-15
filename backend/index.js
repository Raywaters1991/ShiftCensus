// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();


// ===============================
// ✅ PRODUCTION-SAFE CORS
// ===============================

const ALLOWED_ORIGINS = [
  "http://localhost:5173",     // local dev (Vite)
  "https://app.shiftcensus.com", // your custom app domain (recommended)
  "https://shiftcensus.com",     // if you ever use root domain
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow non-browser requests (curl, health checks, server-to-server)
    if (!origin) return callback(null, true);

    // Allow explicit whitelist
    if (ALLOWED_ORIGINS.includes(origin)) {
      return callback(null, true);
    }

    // Allow Vercel deployments (*.vercel.app)
    try {
      const host = new URL(origin).hostname;
      if (host.endsWith(".vercel.app")) {
        return callback(null, true);
      }
    } catch (err) {
      // Ignore malformed origin
    }

    return callback(new Error(`CORS blocked: ${origin}`));
  },

  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "x-org-id",
    "x-org-code",
  ],
  credentials: true,
  optionsSuccessStatus: 204,
};

// IMPORTANT: CORS before routes
app.use(cors(corsOptions));

// Express 5 requires regex for wildcard OPTIONS
app.options(/.*/, cors(corsOptions));


// ===============================
// BODY PARSING
// ===============================
app.use(express.json());


// ===============================
// ROUTES
// ===============================

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


// ===============================
// HEALTH + ROOT
// ===============================

app.get("/", (_req, res) => {
  res.send("ShiftCensus backend running.");
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});


// ===============================
// START SERVER
// ===============================

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
