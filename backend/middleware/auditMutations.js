const supabaseAdmin = require("../supabaseAdmin");

function cleanPath(originalUrl) {
  return String(originalUrl || "").split("?")[0].slice(0, 500);
}

function actionName(req) {
  const method = String(req.method || "").toUpperCase();
  const path = cleanPath(req.originalUrl || req.url);
  return `${method} ${path}`.slice(0, 600);
}

function clientIp(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim();
  return (forwarded || req.ip || req.socket?.remoteAddress || "").slice(0, 120) || null;
}

function shouldAudit(req) {
  const method = String(req.method || "GET").toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return false;
  return String(req.originalUrl || req.url || "").startsWith("/api/");
}

function auditMutations(req, res, next) {
  if (!shouldAudit(req)) return next();

  const started = Date.now();

  res.on("finish", () => {
    const row = {
      org_id: req.orgId || req.org_id || null,
      org_code: req.orgCode || req.org_code || null,
      actor_user_id: req.user?.id || req.userId || null,
      actor_email: req.user?.email || req.email || null,
      actor_role: req.membershipRole || req.role || null,
      action: actionName(req),
      method: String(req.method || "").toUpperCase(),
      path: cleanPath(req.originalUrl || req.url),
      status_code: Number(res.statusCode || 0),
      ip_address: clientIp(req),
      user_agent: String(req.headers?.["user-agent"] || "").slice(0, 500) || null,
      duration_ms: Math.max(0, Date.now() - started),
      metadata: {
        request_id: req.headers?.["x-request-id"] || null,
        outcome: Number(res.statusCode || 0) >= 400 ? "denied_or_failed" : "completed",
      },
    };

    // Never store request bodies, passwords, tokens, resident names, or free-text PHI here.
    supabaseAdmin
      .from("security_audit_log")
      .insert(row)
      .then(({ error }) => {
        if (error) console.error("AUDIT LOG INSERT ERROR:", error.message || error);
      })
      .catch((error) => console.error("AUDIT LOG INSERT ERROR:", error));
  });

  return next();
}

module.exports = { auditMutations };
