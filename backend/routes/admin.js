const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");

// GET logged-in user profile
router.get("/profile", requireAuth, async (req, res) => {
  const user = req.user;

  const profile = {
    email: user.email,
    uid: user.id,
    role: user.user_metadata?.role || null,
    org_code: user.user_metadata?.org_code || null,
    org_name: null,
    org_logo: null,
  };

  // Fetch organization row
  if (profile.org_code) {
    const { data: org, error } = await supabase
      .from("orgs")
      .select("*")
      .eq("org_code", profile.org_code)
      .single();

    if (!error && org) {
      profile.org_name = org.name;
      profile.org_logo = org.logo_url;
    }
  }

  return res.json(profile);
});

module.exports = router;
