// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();

// ----------------------------------------------------
// DEBUG: verify your keys at boot (safe, no key printed)
// ----------------------------------------------------
function jwtRole(jwt) {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split(".")[1], "base64").toString("utf8"));
    return payload?.role || "unknown";
  } catch {
    return "unknown";
  }
}

console.log("SUPABASE_URL set?", !!process.env.SUPABASE_URL);
console.log("SUPABASE_ANON_KEY set?", !!process.env.SUPABASE_ANON_KEY);
console.log("SUPABASE_SERVICE_ROLE_KEY set?", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("SERVICE_ROLE_KEY role:", jwtRole(process.env.SUPABASE_SERVICE_ROLE_KEY));
}

// -----------------------------
// CORS
// -----------------------------
const allowedOrigins = new Set(
  [
    process.env.APP_PUBLIC_URL,
    "http://localhost:5173",
    "https://shiftcensus.com",
    "https://www.shiftcensus.com",
  ].filter(Boolean)
);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    if (/\.vercel\.app$/.test(new URL(origin).hostname)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-org-id", "x-org-code"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
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
