// middleware/auth.js
const supabase = require("../supabase");

function getRoleFromUser(user) {
  return (
    user?.app_metadata?.role ||
    user?.user_metadata?.role ||
    user?.role ||
    null
  );
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

    if (!token) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = data.user;

    // ✅ NEW: normalize role onto req.role
    const role = getRoleFromUser(data.user);
    req.role = role ? String(role).toLowerCase() : null;

    next();
  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err);
    res.status(500).json({ error: "Auth middleware failed" });
  }
}

function requireSuperAdmin(req, res, next) {
  // ✅ use normalized req.role (and tolerate uppercase in stored metadata)
  if (String(req.role || "").toLowerCase() !== "superadmin") {
    return res.status(403).json({ error: "SuperAdmin only" });
  }
  next();
}

module.exports = { requireAuth, requireSuperAdmin };
