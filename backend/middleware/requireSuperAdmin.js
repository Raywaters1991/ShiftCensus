function requireSuperAdmin(req, res, next) {
  const role = req.user?.app_metadata?.role;

  if (role !== "superadmin") {
    return res.status(403).json({ error: "Superadmin access required" });
  }

  next();
}

module.exports = { requireSuperAdmin };
