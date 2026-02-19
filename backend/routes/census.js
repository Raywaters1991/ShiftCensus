// backend/routes/census.js
const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");
const { requireAuth } = require("../middleware/auth");
const { requireOrg } = require("../middleware/orgGuard");

router.use(requireAuth);
router.use(requireOrg);

// -------------------------
// Helpers
// -------------------------
function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function isNumericishLabel(label) {
  const s = safeStr(label).trim();
  return !!s && /^[0-9]+$/.test(s);
}

function normStatus(s) {
  const v = safeStr(s || "empty").toLowerCase().trim();
  return v === "occupied" || v === "leave" || v === "empty" ? v : "empty";
}

function isActiveStatus(s) {
  const v = normStatus(s);
  return v === "occupied" || v === "leave";
}

function normBedLabel(v) {
  return safeStr(v).trim().toUpperCase();
}

function normRoomLabel(v) {
  return safeStr(v).trim();
}

function normGender(g) {
  const v = safeStr(g).trim().toLowerCase();
  if (v === "male") return "Male";
  if (v === "female") return "Female";
  if (v === "other") return "Other";
  if (v === "unknown" || !v) return "Unknown";
  return "Unknown";
}

function isMeaningfulGender(g) {
  return g === "Male" || g === "Female";
}

function roomDerivedGender(activeBeds) {
  const set = new Set();
  for (const b of activeBeds || []) {
    if (!isActiveStatus(b.status)) continue;
    const g = normGender(b.patient_gender);
    if (isMeaningfulGender(g)) set.add(g);
  }
  if (set.size === 1) return Array.from(set)[0];
  return "Neutral";
}

function isSuperAdmin(req) {
  return String(req.user?.app_metadata?.role || "").toLowerCase() === "superadmin";
}

/**
 * Effective org id:
 * - prefer req.orgId set by orgGuard
 * - fall back to x-org-id header (legacy paths)
 * - fall back to token metadata (legacy)
 * - superadmin can override with ?org_id=
 */
function getEffectiveOrgId(req) {
  const headerOrgId = req.headers["x-org-id"] ? String(req.headers["x-org-id"]) : null;

  const metaOrgId =
    req.user?.user_metadata?.org_id ||
    req.user?.user_metadata?.orgId ||
    req.user?.app_metadata?.org_id ||
    req.user?.app_metadata?.orgId ||
    null;

  const orgIdFromQuery = req.query?.org_id ? String(req.query.org_id) : null;

  return req.orgId || headerOrgId || metaOrgId || (isSuperAdmin(req) ? orgIdFromQuery : null);
}

// -------------------------
// GET /census/bed-board
// Builds bed-board from facility_rooms + facility_beds,
// ensures a matching row exists in public.census for each active bed.
//
// ✅ Uses supabaseAdmin to avoid RLS/policy recursion
// ✅ Claims legacy census rows before inserting to avoid unique conflicts
// -------------------------
router.get("/bed-board", async (req, res) => {
  try {
    const effectiveOrgId = getEffectiveOrgId(req);
    if (!effectiveOrgId) return res.status(400).json({ error: "Missing org_id context" });

    // 1) rooms
    const roomsRes = await supabaseAdmin
      .from("facility_rooms")
      .select("id, org_id, room_label, unit, display_order")
      .eq("org_id", effectiveOrgId)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("room_label", { ascending: true });

    if (roomsRes.error) throw roomsRes.error;
    const rooms = roomsRes.data || [];
    const roomIds = rooms.map((r) => r.id);
    if (roomIds.length === 0) return res.json([]);

    // 2) beds
    const bedsRes = await supabaseAdmin
      .from("facility_beds")
      .select("id, org_id, room_id, bed_label, display_order, is_active")
      .eq("org_id", effectiveOrgId)
      .in("room_id", roomIds)
      .eq("is_active", true)
      .order("display_order", { ascending: true, nullsFirst: false })
      .order("bed_label", { ascending: true });

    if (bedsRes.error) throw bedsRes.error;
    const beds = bedsRes.data || [];

    // 3) census rows for org
    const censusRes = await supabaseAdmin
      .from("census")
      .select(
        [
          "id",
          "room",
          "room_number",
          "bed",
          "status",
          "admit_date",
          "expected_discharge",
          "org_code",
          "payer_source",
          "care_type",
          "org_id",
          "patient_label",
          "private_pay_note",
          "patient_gender",
          "couple_override",
          "couple_note",
          "facility_bed_id",
        ].join(",")
      )
      .eq("org_id", effectiveOrgId);

    if (censusRes.error) throw censusRes.error;
    const censusRows = censusRes.data || [];

    const censusByFacilityBedId = new Map(
      censusRows
        .filter((r) => r.facility_bed_id)
        .map((r) => [String(r.facility_bed_id), r])
    );

    // Legacy rows without facility_bed_id
    const legacy = censusRows.filter((r) => !r.facility_bed_id);

    // Keyed lookups
    const legacyByRoomNumberBed = new Map();
    const legacyByRoomTextBed = new Map();

    for (const r of legacy) {
      const bedKey = normBedLabel(r.bed);
      const rn = safeStr(r.room_number).trim();
      const roomText = normRoomLabel(r.room);

      if (rn && bedKey) legacyByRoomNumberBed.set(`${rn}::${bedKey}`, r);
      if (roomText && bedKey) legacyByRoomTextBed.set(`${roomText}::${bedKey}`, r);
    }

    const roomById = new Map(rooms.map((r) => [String(r.id), r]));

    const toInsert = [];
    const toClaimUpdates = [];

    for (const b of beds) {
      const facilityBedId = String(b.id);
      if (censusByFacilityBedId.has(facilityBedId)) continue;

      const room = roomById.get(String(b.room_id));
      const roomLabel = normRoomLabel(room?.room_label) || "—";
      const bedLabel = normBedLabel(b.bed_label) || "—";
      const derivedRoomNumber = isNumericishLabel(roomLabel) ? roomLabel : null;

      // claim legacy row by (room_number, bed) first
      let legacyRow = null;
      if (derivedRoomNumber) {
        legacyRow = legacyByRoomNumberBed.get(`${derivedRoomNumber}::${bedLabel}`) || null;
      }
      // fallback claim by (room, bed)
      if (!legacyRow) {
        legacyRow = legacyByRoomTextBed.get(`${roomLabel}::${bedLabel}`) || null;
      }

      if (legacyRow?.id) {
        toClaimUpdates.push({
          id: legacyRow.id,
          patch: {
            facility_bed_id: b.id,
            room: roomLabel,
            room_number: derivedRoomNumber,
            bed: bedLabel,
          },
        });

        if (derivedRoomNumber) legacyByRoomNumberBed.delete(`${derivedRoomNumber}::${bedLabel}`);
        legacyByRoomTextBed.delete(`${roomLabel}::${bedLabel}`);
        continue;
      }

      // insert new
      toInsert.push({
        org_id: effectiveOrgId,
        facility_bed_id: b.id,
        room: roomLabel,
        status: "empty",
        room_number: derivedRoomNumber,
        bed: bedLabel,

        admit_date: null,
        expected_discharge: null,
        org_code: null,
        payer_source: null,
        care_type: null,
        patient_label: null,
        private_pay_note: "",
        patient_gender: "Unknown",
        couple_override: false,
        couple_note: null,
      });
    }

    // apply claim updates
    for (const u of toClaimUpdates) {
      const up = await supabaseAdmin
        .from("census")
        .update(u.patch)
        .eq("id", u.id)
        .eq("org_id", effectiveOrgId)
        .select(
          [
            "id",
            "room",
            "room_number",
            "bed",
            "status",
            "admit_date",
            "expected_discharge",
            "org_code",
            "payer_source",
            "care_type",
            "org_id",
            "patient_label",
            "private_pay_note",
            "patient_gender",
            "couple_override",
            "couple_note",
            "facility_bed_id",
          ].join(",")
        )
        .single();

      if (up.error) throw up.error;
      if (up.data?.facility_bed_id)
        censusByFacilityBedId.set(String(up.data.facility_bed_id), up.data);
    }

    // insert missing
    if (toInsert.length > 0) {
      const ins = await supabaseAdmin
        .from("census")
        .insert(toInsert)
        .select(
          [
            "id",
            "room",
            "room_number",
            "bed",
            "status",
            "admit_date",
            "expected_discharge",
            "org_code",
            "payer_source",
            "care_type",
            "org_id",
            "patient_label",
            "private_pay_note",
            "patient_gender",
            "couple_override",
            "couple_note",
            "facility_bed_id",
          ].join(",")
        );

      if (ins.error) {
        console.error("CENSUS INSERT ERROR:", ins.error);
        throw ins.error;
      }

      for (const r of ins.data || []) {
        if (r.facility_bed_id) censusByFacilityBedId.set(String(r.facility_bed_id), r);
      }
    }

    // stable sort by room order then bed order
    const sortedBeds = beds
      .slice()
      .sort((a, b) => {
        const ra = roomById.get(String(a.room_id));
        const rb = roomById.get(String(b.room_id));

        const rao = ra?.display_order ?? 999999;
        const rbo = rb?.display_order ?? 999999;
        if (rao !== rbo) return rao - rbo;

        const ral = safeStr(ra?.room_label);
        const rbl = safeStr(rb?.room_label);
        const rc = ral.localeCompare(rbl, undefined, { numeric: true, sensitivity: "base" });
        if (rc !== 0) return rc;

        const ao = a.display_order ?? 999999;
        const bo = b.display_order ?? 999999;
        if (ao !== bo) return ao - bo;

        return safeStr(a.bed_label).localeCompare(safeStr(b.bed_label), undefined, {
          numeric: true,
          sensitivity: "base",
        });
      });

    const final = sortedBeds.map((b) => {
      const room = roomById.get(String(b.room_id));
      const roomLabel = normRoomLabel(room?.room_label) || "—";
      const bedLabel = normBedLabel(b.bed_label) || "—";

      const census = censusByFacilityBedId.get(String(b.id));

      if (!census) {
        return {
          id: null,
          org_id: effectiveOrgId,
          facility_bed_id: b.id,
          room: roomLabel,
          room_number: isNumericishLabel(roomLabel) ? roomLabel : null,
          bed: bedLabel,
          status: "empty",
          admit_date: null,
          expected_discharge: null,
          org_code: null,
          payer_source: null,
          care_type: null,
          patient_label: null,
          private_pay_note: "",
          patient_gender: "Unknown",
          couple_override: false,
          couple_note: null,
        };
      }

      return {
        ...census,
        room: roomLabel,
        room_number: isNumericishLabel(roomLabel) ? roomLabel : census.room_number ?? null,
        bed: bedLabel,
        status: normStatus(census.status),
      };
    });

    return res.json(final);
  } catch (err) {
    console.error("BED-BOARD ERROR:", err);
    return res.status(500).json({ error: "Failed to load bed board" });
  }
});

// -------------------------
// PUT /census/:id
// Enforces:
// - Gender mismatch (409 GENDER_MISMATCH) unless couple_override true
// - Couple lock (409 ROOM_LOCKED): if room is marked as couple/exception, max 2 active residents in room
//
// ✅ Uses supabaseAdmin to avoid RLS/policy recursion
// -------------------------
router.put("/:id", async (req, res) => {
  try {
    const effectiveOrgId = getEffectiveOrgId(req);
    if (!effectiveOrgId && !isSuperAdmin(req)) {
      return res.status(400).json({ error: "Missing org_id context" });
    }

    const id = String(req.params.id);

    // 1) Load current row (we need its room/room_number/bed)
    const curRes = await supabaseAdmin
      .from("census")
      .select(
        [
          "id",
          "org_id",
          "room",
          "room_number",
          "bed",
          "status",
          "patient_gender",
          "couple_override",
          "facility_bed_id",
        ].join(",")
      )
      .eq("id", id)
      .eq("org_id", effectiveOrgId)
      .single();

    if (curRes.error) {
      console.error("CENSUS LOAD ERROR:", curRes.error);
      return res.status(404).json({ error: "Not found" });
    }

    const current = curRes.data;

    // 2) Build patch (your original rules)
    const patch = { ...(req.body || {}) };

    delete patch.org_id;
    delete patch.org_code;
    delete patch.facility_bed_id;
    delete patch.room; // keep room label controlled by bed-board

    if (patch.status !== undefined) patch.status = normStatus(patch.status);

    // 3) Determine "next" state for enforcement
    const nextStatus = patch.status !== undefined ? patch.status : current.status;
    const nextIsActive = isActiveStatus(nextStatus);

    const nextGender =
      patch.patient_gender !== undefined
        ? normGender(patch.patient_gender)
        : normGender(current.patient_gender);

    const nextCoupleOverride =
      patch.couple_override !== undefined ? !!patch.couple_override : !!current.couple_override;

    // 4) Only enforce when update would make bed ACTIVE
    if (nextIsActive) {
      const roomNumber = safeStr(current.room_number).trim();
      const roomText = normRoomLabel(current.room);

      let othersQuery = supabaseAdmin
        .from("census")
        .select(
          [
            "id",
            "room",
            "room_number",
            "bed",
            "status",
            "patient_gender",
            "couple_override",
          ].join(",")
        )
        .eq("org_id", effectiveOrgId);

      if (roomNumber) othersQuery = othersQuery.eq("room_number", roomNumber);
      else othersQuery = othersQuery.eq("room", roomText);

      const othersRes = await othersQuery;
      if (othersRes.error) throw othersRes.error;

      const sameRoomAll = (othersRes.data || []).filter((r) => String(r.id) !== String(id));
      const sameRoomActive = sameRoomAll.filter((r) => isActiveStatus(r.status));

      // Couple lock
      const roomAlreadyCoupleLocked = sameRoomActive.some((r) => !!r.couple_override);
      const roomWillBeCoupleLocked = roomAlreadyCoupleLocked || nextCoupleOverride;

      const activeCountAfter = sameRoomActive.length + 1;
      if (roomWillBeCoupleLocked && activeCountAfter > 2) {
        return res.status(409).json({
          error: "ROOM_LOCKED",
          details: {
            message: `Room ${roomNumber || roomText || "—"} is locked for a couple/exception (max 2 active residents).`,
            max_active: 2,
            active_after: activeCountAfter,
          },
        });
      }

      // Gender mismatch
      const roomGender = roomDerivedGender(sameRoomActive);

      if (
        !nextCoupleOverride &&
        roomGender !== "Neutral" &&
        isMeaningfulGender(nextGender) &&
        roomGender !== nextGender
      ) {
        return res.status(409).json({
          error: "GENDER_MISMATCH",
          details: {
            message: `Room ${roomNumber || roomText || "—"} currently has an active ${roomGender.toLowerCase()} resident.`,
            roomGender,
            incomingGender: nextGender,
          },
        });
      }
    }

    // 5) Apply update
    const up = await supabaseAdmin
      .from("census")
      .update(patch)
      .eq("id", id)
      .eq("org_id", effectiveOrgId)
      .select(
        [
          "id",
          "room",
          "room_number",
          "bed",
          "status",
          "admit_date",
          "expected_discharge",
          "org_code",
          "payer_source",
          "care_type",
          "org_id",
          "patient_label",
          "private_pay_note",
          "patient_gender",
          "couple_override",
          "couple_note",
          "facility_bed_id",
        ].join(",")
      )
      .single();

    if (up.error) {
      console.error("CENSUS UPDATE ERROR:", up.error);
      return res.status(500).json({ error: "Failed to update census row" });
    }

    return res.json(up.data);
  } catch (err) {
    console.error("CENSUS UPDATE ERROR:", err);
    return res.status(500).json({ error: "Failed to update census row" });
  }
});

module.exports = router;
