// backend/middleware/auth.js
const supabase = require("../supabase");           // anon client
const supabaseAdmin = require("../supabaseAdmin"); // service role client

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

    if (!token) return res.status(401).json({ error: "Missing Bearer token" });

    // ✅ Validate the JWT
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid token" });

    const user = data.user;

    // Try metadata first
    let role = getRoleFromUser(user);

    // Ignore Supabase default "authenticated"
    if (!role || role === "authenticated") {
      // ✅ Fetch role via service-role client (bypasses RLS)
      const { data: profile, error: profileError } = await supabaseAdmin
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

    next();
  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err);
    return res.status(500).json({ error: "Auth middleware failed" });
  }
}

function requireSuperAdmin(req, res, next) {
  if (String(req.role || "").toLowerCase() !== "superadmin") {
    return res.status(403).json({ error: "SuperAdmin only" });
  }
  next();
}

module.exports = { requireAuth, requireSuperAdmin };
