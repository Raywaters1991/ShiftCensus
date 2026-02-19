// backend/routes/invites.js
const express = require("express");
const router = express.Router();

const supabaseAdmin = require("../supabaseAdmin");

function isStrongEnough(pw) {
  return typeof pw === "string" && pw.length >= 10;
}

router.post("/accept", async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};

    if (!token) return res.status(400).json({ error: "Missing token" });
    if (!isStrongEnough(newPassword)) {
      return res.status(400).json({ error: "Password must be at least 10 characters." });
    }

    // Find invite (service role avoids RLS surprises)
    const { data: invite, error: invErr } = await supabaseAdmin
      .from("user_invites")
      .select("*")
      .eq("token", token)
      .maybeSingle();

    if (invErr) return res.status(500).json({ error: "Invite lookup failed" });
    if (!invite) return res.status(404).json({ error: "Invalid token" });
    if (invite.used_at) return res.status(400).json({ error: "Token already used" });

    const now = new Date();
    if (new Date(invite.expires_at) < now) return res.status(400).json({ error: "Token expired" });

    // Update auth user password via admin
    const { data, error } = await supabaseAdmin.auth.admin.updateUserById(invite.user_id, {
      password: newPassword,
    });

    if (error) {
      console.error("INVITE ACCEPT updateUserById ERROR:", error);
      return res.status(500).json({ error: "Failed to set password" });
    }

    // Mark used
    await supabaseAdmin
      .from("user_invites")
      .update({ used_at: new Date().toISOString() })
      .eq("id", invite.id);

    return res.json({ success: true, user_id: data?.user?.id || invite.user_id });
  } catch (e) {
    console.error("INVITE ACCEPT ERROR:", e);
    return res.status(500).json({ error: "Invite accept failed" });
  }
});

module.exports = router;
