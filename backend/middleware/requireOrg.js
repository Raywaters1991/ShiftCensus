// backend/middleware/requireOrg.js
const supabase = require("../supabase");

function isUuid(v) {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

module.exports = async function requireOrg(req, res, next) {
  try {
    const headerOrgId = req.headers["x-org-id"];
    const headerOrgCode = req.headers["x-org-code"];

    // Prefer UUID org id if present
    if (headerOrgId && isUuid(String(headerOrgId))) {
      req.orgId = String(headerOrgId);
      req.orgCode = headerOrgCode ? String(headerOrgCode) : null;
      return next();
    }

    const orgCode = headerOrgCode ? String(headerOrgCode).trim() : "";
    if (!orgCode) {
      return res.status(400).json({ error: "Missing org context (x-org-id or x-org-code required)" });
    }

    // Your FK references orgs(id). We'll resolve org_id from orgs using org_code (or code)
    // Try org_code first:
    let org = null;

    {
      const { data, error } = await supabase
        .from("orgs")
        .select("id, org_code")
        .eq("org_code", orgCode)
        .maybeSingle();

      if (error) {
        console.error("REQUIRE ORG LOOKUP ERROR (org_code):", error);
        return res.status(500).json({ error: "Failed to resolve organization" });
      }
      org = data || null;
    }

    // If org_code column doesn't exist in your orgs table, try `code`
    if (!org?.id) {
      const { data, error } = await supabase
        .from("orgs")
        .select("id, code")
        .eq("code", orgCode)
        .maybeSingle();

      if (error) {
        console.error("REQUIRE ORG LOOKUP ERROR (code):", error);
        return res.status(500).json({ error: "Failed to resolve organization" });
      }
      if (data?.id) {
        req.orgId = data.id;
        req.orgCode = data.code || orgCode;
        return next();
      }
    }

    if (!org?.id) {
      return res.status(400).json({ error: "Invalid org code" });
    }

    req.orgId = org.id;
    req.orgCode = org.org_code || orgCode;
    return next();
  } catch (err) {
    console.error("REQUIRE ORG MIDDLEWARE ERROR:", err);
    return res.status(500).json({ error: "Org middleware failed" });
  }
};
