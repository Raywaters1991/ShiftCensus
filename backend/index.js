// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// -----------------------------
// CORS
// -----------------------------
const allowedOrigins = new Set(
  [
    process.env.APP_PUBLIC_URL,          // e.g. https://shiftcensus.com
    "http://localhost:5173",
    "https://shiftcensus.com",
    "https://www.shiftcensus.com",
  ].filter(Boolean)
);

const corsOptions = {
  origin: (origin, cb) => {
    // Allow server-to-server calls (no Origin header)
    if (!origin) return cb(null, true);

    // Allow known origins
    if (allowedOrigins.has(origin)) return cb(null, true);

    // Allow Vercel preview + prod domains
    // (covers: https://something.vercel.app)
    if (/\.vercel\.app$/.test(new URL(origin).hostname)) return cb(null, true);

    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-org-id", "x-org-code"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Express 5 safe preflight handler
app.options(/.*/, cors(corsOptions));

app.use(express.json());

// -----------------------------
// ROUTES
// -----------------------------
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
app.get("/health", (_req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
