const express = require("express");
const router = express.Router();
const supabaseAdmin = require("../supabaseAdmin");

const safeStr = (v) => (v === null || v === undefined ? "" : String(v));
const normStatus = (s) => {
  const v = safeStr(s || "empty").toLowerCase().trim();
  return ["occupied", "leave", "empty"].includes(v) ? v : "empty";
};
const isActive = (s) => ["occupied", "leave"].includes(normStatus(s));
const normGender = (g) => {
  const v = safeStr(g).trim().toLowerCase();
  if (v === "male") return "Male";
  if (v === "female") return "Female";
  if (v === "other") return "Other";
  return "Unknown";
};
const meaningfulGender = (g) => g === "Male" || g === "Female";
const roomKey = (r) => safeStr(r?.room_number).trim() ? `n:${safeStr(r.room_number).trim()}` : `t:${safeStr(r?.room).trim()}`;
const roomLabel = (r) => safeStr(r?.room_number).trim() || safeStr(r?.room).trim() || "—";

function roomGender(rows) {
  const set = new Set((rows || []).filter((r) => isActive(r.status)).map((r) => normGender(r.patient_gender)).filter(meaningfulGender));
  return set.size === 1 ? [...set][0] : "Neutral";
}

async function roomResidents(orgId, target, excludedIds) {
  let q = supabaseAdmin.from("census").select("id, room, room_number, bed, status, patient_gender, couple_override").eq("org_id", orgId);
  const rn = safeStr(target.room_number).trim();
  q = rn ? q.eq("room_number", rn) : q.eq("room", safeStr(target.room).trim());
  const { data, error } = await q;
  if (error) throw error;
  const excluded = new Set(excludedIds.map(String));
  return (data || []).filter((r) => !excluded.has(String(r.id)) && isActive(r.status));
}

function placementError({ incoming, target, others, override, placement }) {
  if (!isActive(incoming.status)) return null;
  const effectiveOverride = !!incoming.couple_override || !!override;
  const activeOthers = (others || []).filter((r) => isActive(r.status));
  const coupleLocked = activeOthers.some((r) => !!r.couple_override) || effectiveOverride;
  const activeAfter = activeOthers.length + 1;
  if (coupleLocked && activeAfter > 2) {
    return {
      status: 409,
      body: {
        error: "ROOM_LOCKED",
        details: { placement, message: `Room ${roomLabel(target)} is locked for a couple/exception (max 2 active residents).`, max_active: 2, active_after: activeAfter },
      },
    };
  }
  const incomingGender = normGender(incoming.patient_gender);
  const existingGender = roomGender(activeOthers);
  if (!effectiveOverride && existingGender !== "Neutral" && meaningfulGender(incomingGender) && existingGender !== incomingGender) {
    return {
      status: 409,
      body: {
        error: "GENDER_MISMATCH",
        details: { placement, message: `Room ${roomLabel(target)} currently has an active ${existingGender.toLowerCase()} resident.`, room_gender: existingGender, incoming_gender: incomingGender },
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
    if (!/^\d+$/.test(sourceId) || !/^\d+$/.test(destinationId) || sourceId === destinationId) {
      return res.status(400).json({ error: "INVALID_CENSUS_MOVE", message: "A valid source and destination are required." });
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
    if (!isActive(source.status)) return res.status(409).json({ error: "SOURCE_NOT_OCCUPIED", message: "The source bed no longer has an active resident." });

    const swap = isActive(destination.status);
    const sameRoom = roomKey(source) === roomKey(destination);
    const excluded = [sourceId, destinationId];
    const sourceOverride = !!req.body?.source_override;
    const destinationOverride = !!req.body?.destination_override;

    const destOthers = await roomResidents(orgId, destination, excluded);
    if (sameRoom && swap) destOthers.push({ ...destination });
    const firstError = placementError({ incoming: source, target: destination, others: destOthers, override: sourceOverride, placement: "source_to_destination" });
    if (firstError) return res.status(firstError.status).json(firstError.body);

    if (swap) {
      const sourceOthers = await roomResidents(orgId, source, excluded);
      if (sameRoom) sourceOthers.push({ ...source });
      const secondError = placementError({ incoming: destination, target: source, others: sourceOthers, override: destinationOverride, placement: "destination_to_source" });
      if (secondError) return res.status(secondError.status).json(secondError.body);
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
