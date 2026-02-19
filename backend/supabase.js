// backend/supabase.js
require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const url = process.env.SUPABASE_URL;
const anon = process.env.SUPABASE_ANON_KEY;

if (!url) throw new Error("Missing SUPABASE_URL");
if (!anon) throw new Error("Missing SUPABASE_ANON_KEY");

const supabase = createClient(url, anon, {
  auth: { persistSession: false },
});

module.exports = supabase;
