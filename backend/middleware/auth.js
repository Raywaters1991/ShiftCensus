const supabase = require("../supabase");

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing Bearer token" });
    }

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = data.user;
    next();
  } catch (err) {
    res.status(500).json({ error: "Auth middleware failed" });
  }
}

function requireSuperAdmin(req, res, next) {
  if (req.user?.app_metadata?.role !== "superadmin") {
    return res.status(403).json({ error: "SuperAdmin only" });
  }
  next();
}

module.exports = { requireAuth, requireSuperAdmin };
