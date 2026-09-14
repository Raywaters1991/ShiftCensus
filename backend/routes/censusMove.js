const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");

function safeStr(v) {
  return v === null || v === undefined ? "" : String(v);
}

function normStatus(s) {
  const v = safeStr(s || "empty").toLowerCase().trim();
  return ["occupied", "leave", "empty"].includes(v) ? v : "empty";
}

function isActiveStatus(s) {
  const v = normStatus(s);
  return v === "occupied" || v === "leave";
}

function normGender(g) {
  const v = safeStr(g).trim().toLowerCase();
  if (v === "male") return "Male";
  if (v === "female") return "Female";
  if (v === "other") return "Other";
  return "Unknown";
}

function isMeaningfulGender(g) {
  return g === "Male" || g === "Female";
}

function roomKey(row) {
  const roomNumber = safeStr(row?.room_number).trim();
  if (roomNumber) return `n:${roomNumber}`;
  return `t:${safeStr(row?.room).trim()}`;
}

function roomLabel(row) {
  return safeStr(row?.room_number).trim() || safeStr(row?.room).trim() || "—";
}

function roomDerivedGender(activeBeds) {
  const set = new Set();
  for (const b of activeBeds || []) {
    if (!isActiveStatus(b.status)) continue;
    const g = normGender(b.patient_gender);
    if (isMeaningfulGender(g)) set.add(g);
  }
  return set.size === 1 ? Array.from(set)[0] : "Neutral";
}

async function loadRoomResidents(orgId, targetRow, excludedIds) {
  let query = supabaseAdmin
    .from("census")
    .select("id, room, room_number, bed, status, patient_gender, couple_override")
    .eq("org_id", orgId);

  const roomNumber = safeStr(targetRow.room_number).trim();
  if (roomNumber) query = query.eq("room_number", roomNumber);
  else query = query.eq("room", safeStr(targetRow.room).trim());

  const { data, error } = await query;
  if (error) throw error;

  const excluded = new Set((excludedIds || []).map((x) => String(x)));
  return (data || []).filter((r) => !excluded.has(String(r.id)) && isActiveStatus(r.status));
}

function validatePlacement({ incoming, target, others, override }) {
  if (!isActiveStatus(incoming.status)) return null;

  const nextOverride = !!incoming.couple_override || !!override;
  const activeOthers = (others || []).filter((r) => isActiveStatus(r.status));
  const roomAlreadyCoupleLocked = activeOthers.some((r) => !!r.couple_override);
  const roomWillBeCoupleLocked = roomAlreadyCoupleLocked || nextOverride;
  const activeCountAfter = activeOthers.length + 1;

  if (roomWillBeCoupleLocked && activeCountAfter > 2) {
    return {
      status: 409,
      body: {
        error: "ROOM_LOCKED",
        details: {
          message: `Room ${roomLabel(target)} is locked for a couple/exception (max 2 active residents).`,
          max_active: 2,
          active_after: activeCountAfter,
        },
      },
    };
  }

  const incomingGender = normGender(incoming.patient_gender);
  const roomGender = roomDerivedGender(activeOthers);

  if (!nextOverride && roomGender !== "Neutral" && isMeaningfulGender(incomingGender) && roomGender !== incomingGender) {
    return {
      status: 409,
      body: {
        error: "GENDER_MISMATCH",
        details: {
          message: `Room ${roomLabel(target)} currently has an active ${roomGender.toLowerCase()} resident.`,
          room_gender: roomGender,
          roomGender,
          incoming_gender: incomingGender,
          incomingGender,
        },
      },
    };
  }

  return null;
}

router.post("/", async (req, res) => {
  try {
    const orgId = req.orgId || req.org_id || null;
    if (!orgId) return res.status(400).json({ error: "Missing org context" });

    const sourceId = safeStr(req.body?.source_id).trim();
    const destinationId = safeStr(req.body?.destination_id).trim();
    if (!/^\d+$/.test(sourceId) || !/^\d+$/.test(destinationId)) {
      return res.status(400).json({ error: "INVALID_CENSUS_MOVE", message: "Source and destination are required." });
    }
    if (sourceId === destinationId) {
      return res.status(400).json({ error: "INVALID_CENSUS_MOVE", message: "Source and destination must be different beds." });
    }

    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("census")
      .select("id, org_id, room, room_number, bed, status, admit_date, expected_discharge, payer_source, care_type, patient_label, private_pay_note, patient_gender, couple_override, couple_note, facility_bed_id")
      .eq("org_id", orgId)
      .in("id", [sourceId, destinationId]);

    if (rowsError) throw rowsError;
    const source = (rows || []).find((r) => String(r.id) === sourceId);
    const destination = (rows || []).find((r) => String(r.id) === destinationId);
    if (!source || !destination) return res.status(404).json({ error: "CENSUS_ROW_NOT_FOUND" });
    if (!isActiveStatus(source.status)) {
      return res.status(409).json({ error: "SOURCE_NOT_OCCUPIED", message: "The source bed no longer has an active resident." });
    }

    const isSwap = isActiveStatus(destination.status);
    const excludedIds = [sourceId, destinationId];
    const sameRoom = roomKey(source) === roomKey(destination);

    const destinationOthers = await loadRoomResidents(orgId, destination, excludedIds);
    if (sameRoom && isSwap) destinationOthers.push({ ...destination });

    const sourceOverride = !!req.body?.source_override;
    const destinationOverride = !!req.body?.destination_override;

    const sourcePlacementError = validatePlacement({
      incoming: source,
      target: destination,
      others: destinationOthers,
      override: sourceOverride,
    });
    if (sourcePlacementError) return res.status(sourcePlacementError.status).json(sourcePlacementError.body);

    if (isSwap) {
      const sourceOthers = await loadRoomResidents(orgId, source, excludedIds);
      if (sameRoom) sourceOthers.push({ ...source });
      const destinationPlacementError = validatePlacement({
        incoming: destination,
        target: source,
        others: sourceOthers,
        override: destinationOverride,
      });
      if (destinationPlacementError) return res.status(destinationPlacementError.status).json(destinationPlacementError.body);
    }

    const { data, error } = await supabaseAdmin.rpc("atomic_census_move_swap", {
      p_org_id: orgId,
      p_source_id: sourceId,
      p_destination_id: destinationId,
      p_source_override: sourceOverride,
      p_source_override_note: safeStr(req.body?.source_override_note).trim() || null,
      p_destination_override: destinationOverride,
      p_destination_override_note: safeStr(req.body?.destination_override_note).trim() || null,
    });

    if (error) {
      console.error("ATOMIC CENSUS MOVE RPC ERROR:", error);
      const msg = safeStr(error.message);
      if (msg.includes("SOURCE_NOT_FOUND") || msg.includes("DESTINATION_NOT_FOUND")) {
        return res.status(409).json({ error: "CENSUS_CHANGED", message: "The census changed before the move completed. Refresh and try again." });
      }
      return res.status(500).json({ error: "CENSUS_MOVE_FAILED", message: "The move could not be completed." });
    }

    return res.json(data);
  } catch (err) {
    console.error("ATOMIC CENSUS MOVE ERROR:", err);
    return res.status(500).json({ error: "CENSUS_MOVE_FAILED", message: "The move could not be completed." });
  }
});

module.exports = router;
