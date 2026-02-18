// backend/routes/facility.js
const express = require("express");
const router = express.Router();
const supabase = require("../supabase");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

// ✅ FIX: role detection (supports req.role, req.user.app_metadata.role, req.user.user_metadata.role)
function getRole(req) {
  return (
    req?.role ||
    req?.user?.app_metadata?.role ||
    req?.user?.user_metadata?.role ||
    req?.user?.role ||
    null
  );
}

function canManage(req) {
  const r = String(getRole(req) || "").toLowerCase();
  return ["superadmin", "admin", "don", "ed"].includes(r);
}

// Helpers
function cleanText(v, max = 80) {
  const s = String(v ?? "").trim();
  if (!s) return "";
  return s.length > max ? s.slice(0, max) : s;
}

function cleanBool(v) {
  return v === true || v === "true" || v === 1 || v === "1";
}

/* =========================================================
   GET /api/facility/rooms
========================================================= */
router.get("/rooms", requireAuth, requireOrg, async (req, res) => {
  try {
    const orgId = req.orgId;

    const { data: rooms, error: roomErr } = await supabase
      .from("facility_rooms")
      .select("*")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true })
      .order("room_label", { ascending: true });

    if (roomErr) throw roomErr;

    const { data: beds, error: bedErr } = await supabase
      .from("facility_beds")
      .select("*")
      .eq("org_id", orgId)
      .order("display_order", { ascending: true })
      .order("bed_label", { ascending: true });

    if (bedErr) throw bedErr;

    const bedsByRoom = new Map();
    (beds || []).forEach((b) => {
      const rid = b.room_id;
      if (!bedsByRoom.has(rid)) bedsByRoom.set(rid, []);
      bedsByRoom.get(rid).push({
        ...b,
        label: b.bed_label, // frontend expects label
      });
    });

    const out = (rooms || []).map((r) => ({
      ...r,
      name: r.room_label,       // frontend expects name
      room_type: r.unit || null,
      is_active: true,          // rooms table has no is_active
      beds: bedsByRoom.get(r.id) || [],
    }));

    res.json(out);
  } catch (err) {
    console.error("FACILITY ROOMS GET ERROR:", err);
    res.status(500).json({ error: "Failed to load rooms/beds" });
  }
});

/* =========================================================
   POST /api/facility/rooms
========================================================= */
router.post("/rooms", requireAuth, requireOrg, async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: "Insufficient role" });

    const orgId = req.orgId;
    const name = cleanText(req.body?.name, 80);
    const unit = cleanText(req.body?.unit, 80) || null;

    if (!name) return res.status(400).json({ error: "Room name required" });

    const { data: maxRow, error: maxErr } = await supabase
      .from("facility_rooms")
      .select("display_order")
      .eq("org_id", orgId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) throw maxErr;

    const nextOrder = (maxRow?.display_order ?? 0) + 1;

    const { data, error } = await supabase
      .from("facility_rooms")
      .insert({
        org_id: orgId,
        room_label: name,
        unit,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      ...data,
      name: data.room_label,
      room_type: data.unit || null,
      is_active: true,
      beds: [],
    });
  } catch (err) {
    console.error("FACILITY ROOM POST ERROR:", err);
    res.status(500).json({ error: "Failed to create room" });
  }
});

/* =========================================================
   PATCH /api/facility/rooms/:id
========================================================= */
router.patch("/rooms/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: "Insufficient role" });

    const orgId = req.orgId;
    const id = req.params.id;

    const patch = {};
    if (req.body?.name !== undefined) patch.room_label = cleanText(req.body.name, 80) || null;
    if (req.body?.unit !== undefined) patch.unit = cleanText(req.body.unit, 80) || null;
    if (req.body?.display_order !== undefined) patch.display_order = Number(req.body.display_order) || 0;

    const { data, error } = await supabase
      .from("facility_rooms")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Room not found" });

    res.json({
      ...data,
      name: data.room_label,
      room_type: data.unit || null,
      is_active: true,
    });
  } catch (err) {
    console.error("FACILITY ROOM PATCH ERROR:", err);
    res.status(500).json({ error: "Failed to update room" });
  }
});

/* =========================================================
   DELETE /api/facility/rooms/:id
========================================================= */
router.delete("/rooms/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: "Insufficient role" });

    const orgId = req.orgId;
    const id = req.params.id;

    const { error } = await supabase
      .from("facility_rooms")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("FACILITY ROOM DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to delete room" });
  }
});

/* =========================================================
   POST /api/facility/rooms/:roomId/beds
========================================================= */
router.post("/rooms/:roomId/beds", requireAuth, requireOrg, async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: "Insufficient role" });

    const orgId = req.orgId;
    const roomId = req.params.roomId;
    const label = cleanText(req.body?.label, 24);
    const is_active = req.body?.is_active === undefined ? true : cleanBool(req.body?.is_active);

    if (!label) return res.status(400).json({ error: "Bed label required" });

    const { data: room, error: roomErr } = await supabase
      .from("facility_rooms")
      .select("id")
      .eq("id", roomId)
      .eq("org_id", orgId)
      .single();

    if (roomErr || !room) return res.status(404).json({ error: "Room not found" });

    const { data: maxBed, error: maxErr } = await supabase
      .from("facility_beds")
      .select("display_order")
      .eq("org_id", orgId)
      .eq("room_id", roomId)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (maxErr) throw maxErr;

    const nextOrder = (maxBed?.display_order ?? 0) + 1;

    const { data, error } = await supabase
      .from("facility_beds")
      .insert({
        org_id: orgId,
        room_id: roomId,
        bed_label: label,
        is_active,
        display_order: nextOrder,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({
      ...data,
      label: data.bed_label,
    });
  } catch (err) {
    console.error("FACILITY BED POST ERROR:", err);
    res.status(500).json({ error: "Failed to create bed" });
  }
});

/* =========================================================
   PATCH /api/facility/beds/:id
========================================================= */
router.patch("/beds/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: "Insufficient role" });

    const orgId = req.orgId;
    const id = req.params.id;

    const patch = {};
    if (req.body?.label !== undefined) patch.bed_label = cleanText(req.body.label, 24) || null;
    if (req.body?.is_active !== undefined) patch.is_active = cleanBool(req.body.is_active);
    if (req.body?.display_order !== undefined) patch.display_order = Number(req.body.display_order) || 0;

    const { data, error } = await supabase
      .from("facility_beds")
      .update(patch)
      .eq("id", id)
      .eq("org_id", orgId)
      .select()
      .single();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: "Bed not found" });

    res.json({
      ...data,
      label: data.bed_label,
    });
  } catch (err) {
    console.error("FACILITY BED PATCH ERROR:", err);
    res.status(500).json({ error: "Failed to update bed" });
  }
});

/* =========================================================
   DELETE /api/facility/beds/:id
========================================================= */
router.delete("/beds/:id", requireAuth, requireOrg, async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: "Insufficient role" });

    const orgId = req.orgId;
    const id = req.params.id;

    const { error } = await supabase
      .from("facility_beds")
      .delete()
      .eq("id", id)
      .eq("org_id", orgId);

    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("FACILITY BED DELETE ERROR:", err);
    res.status(500).json({ error: "Failed to delete bed" });
  }
});

/* =========================================================
   POST /api/facility/beds/reorder
========================================================= */
router.post("/beds/reorder", requireAuth, requireOrg, async (req, res) => {
  try {
    if (!canManage(req)) return res.status(403).json({ error: "Insufficient role" });

    const orgId = req.orgId;
    const roomId = req.body?.room_id;
    const bedIds = Array.isArray(req.body?.bed_ids) ? req.body.bed_ids : [];

    if (!roomId || bedIds.length === 0) {
      return res.status(400).json({ error: "room_id and bed_ids[] required" });
    }

    const { data: beds, error: bedErr } = await supabase
      .from("facility_beds")
      .select("id")
      .eq("org_id", orgId)
      .eq("room_id", roomId);

    if (bedErr) throw bedErr;

    const allowed = new Set((beds || []).map((b) => b.id));
    for (const id of bedIds) {
      if (!allowed.has(id)) return res.status(403).json({ error: "Invalid bed id in list" });
    }

    const updates = bedIds.map((id, idx) => ({
      id,
      org_id: orgId,
      display_order: idx + 1,
    }));

    const { error } = await supabase.from("facility_beds").upsert(updates);
    if (error) throw error;

    res.json({ success: true });
  } catch (err) {
    console.error("FACILITY BED REORDER ERROR:", err);
    res.status(500).json({ error: "Failed to reorder beds" });
  }
});

module.exports = router;
