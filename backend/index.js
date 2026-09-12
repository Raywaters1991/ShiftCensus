// backend/index.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { requireAuth } = require("./middleware/auth");
const { requireOrg } = require("./middleware/orgGuard");
const { requireCensusAccess } = require("./middleware/censusAccess");
const { requireOrgAdminForWrites, requireManageAdmins } = require("./middleware/adminAccess");
const { auditMutations } = require("./middleware/auditMutations");
const { securityHeaders, createRateLimiter } = require("./middleware/productionSecurity");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

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
if (process.env.SUPABASE_SERVICE_ROLE_KEY) console.log("SERVICE_ROLE_KEY role:", jwtRole(process.env.SUPABASE_SERVICE_ROLE_KEY));

const previewOrigins = String(process.env.APP_PREVIEW_ORIGINS || "")
  .split(",")
  .map((x) => x.trim())
  .filter(Boolean);

const allowedOrigins = new Set([
  process.env.APP_PUBLIC_URL,
  "http://localhost:5173",
  "https://shiftcensus.com",
  "https://www.shiftcensus.com",
  "https://app.shiftcensus.com",
  ...previewOrigins,
].filter(Boolean));

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    return cb(new Error(`CORS blocked for origin: ${origin}`), false);
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-org-id", "x-org-code"],
  optionsSuccessStatus: 204,
};

const apiLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 600, name: "api" });
const publicSensitiveLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, name: "public-sensitive" });

app.use(securityHeaders);
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(express.json({ limit: "256kb" }));
app.use(auditMutations);
app.use("/api", apiLimiter);

app.use("/api/adminmanagement", requireAuth, requireOrg, requireManageAdmins, require("./routes/adminManagement"));
app.use("/api/units", require("./routes/units"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api/census", requireAuth, requireOrg, requireCensusAccess, require("./routes/census"));
app.use("/api/dashboard", require("./routes/dashboard"));
app.use("/api/shifts", require("./routes/shifts"));
app.use("/api/shift-assignments", require("./routes/shiftAssignments"));
app.use("/api/staff", require("./routes/staff"));
app.use("/api/organizations", require("./routes/organizations"));
app.use("/api/assignments", require("./routes/assignments"));
app.use("/api/templates", require("./routes/templates"));
app.use("/api/shift-settings", require("./routes/shiftSettings"));
app.use("/api/invites", publicSensitiveLimiter, require("./routes/invites"));
app.use("/api/departments", require("./routes/departments"));
app.use("/api/org-settings", requireAuth, requireOrg, requireOrgAdminForWrites, require("./routes/orgSettings"));
app.use("/api/facility", requireAuth, requireOrg, requireOrgAdminForWrites, require("./routes/facility"));
app.use("/api/me", require("./routes/me"));
app.use("/api/schedules", require("./routes/schedules"));
app.use("/api/security-audit", require("./routes/securityAudit"));
app.use("/api/security-self-test", require("./routes/securitySelfTest"));

app.get("/", (_req, res) => res.send("ShiftCensus backend running."));
app.get("/health", (_req, res) => res.json({ ok: true }));

app.use((err, _req, res, _next) => {
  console.error("UNHANDLED EXPRESS ERROR:", err?.message || err);
  if (res.headersSent) return;
  return res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
