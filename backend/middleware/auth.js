// backend/middleware/auth.js
const supabase = require("../supabase"); // anon client (JWT validation)
const supabaseAdmin = require("../supabaseAdmin"); // service role (DB reads)

// Extract a role from the Supabase user object (if you ever set it in metadata)
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
    const authHeader = String(req.headers.authorization || "");
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;

    if (!token) return res.status(401).json({ error: "Missing Bearer token" });

    // ✅ Validate JWT (anon client)
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) return res.status(401).json({ error: "Invalid token" });

    const user = data.user;

    // -----------------------------
    // Determine a GLOBAL role
    // -----------------------------
    // Priority:
    // 1) metadata role (if you set it)
    // 2) profiles.role (your DB source of truth)
    //
    // IMPORTANT: org-scoped permission role should come from requireOrg -> req.membershipRole
    let role = getRoleFromUser(user);

    // Ignore Supabase default "authenticated"
    if (!role || String(role).toLowerCase() === "authenticated") {
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      if (!profileError && profile?.role) role = profile.role;
    }

    // -----------------------------
    // Attach auth context to request
    // -----------------------------
    req.user = user; // full supabase user object
    req.userId = user.id; // convenience
    req.email = user.email || null;

    // global role (superadmin lives here)
    req.role = role ? String(role).toLowerCase() : null;

    // optional debugging fields (safe)
    req.profileRole = req.role;

    return next();
  } catch (err) {
    console.error("AUTH MIDDLEWARE ERROR:", err);
    return res.status(500).json({ error: "Auth middleware failed" });
  }
}

function requireSuperAdmin(req, res, next) {
  if (String(req.role || "").toLowerCase() !== "superadmin") {
    return res.status(403).json({ error: "SuperAdmin only" });
  }
  return next();
}

module.exports = { requireAuth, requireSuperAdmin };
