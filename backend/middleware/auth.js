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

    const user = data.user;

    // Try metadata first
    let role = getRoleFromUser(user);

    // 🔥 Ignore Supabase default "authenticated" role
    if (!role || role === "authenticated") {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profileError && profile?.role) {
        role = profile.role;
      }
    }

    req.user = user;
    req.role = role ? String(role).toLowerCase() : null;

    console.log("AUTH DEBUG → user.id:", user.id);
    console.log("AUTH DEBUG → final req.role:", req.role);

    next();
  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err);
    res.status(500).json({ error: "Auth middleware failed" });
  }
}

function requireSuperAdmin(req, res, next) {
  console.log("SUPERADMIN CHECK → req.role:", req.role);

  if (String(req.role || "").toLowerCase() !== "superadmin") {
    return res.status(403).json({ error: "SuperAdmin only" });
  }

  next();
}

module.exports = { requireAuth, requireSuperAdmin };
