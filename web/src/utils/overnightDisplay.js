export function mergeActiveOvernightGroups(groups, staffedShifts, activeShifts, configuredShiftTypes, shiftBucket) {
  const merged = Object.fromEntries(configuredShiftTypes.map((key) => [key, [...(groups[key] || [])]]));
  const seen = new Set(staffedShifts.map((shift) => String(shift.id)));

  activeShifts
    .filter((shift) => shift.staff_id != null && !seen.has(String(shift.id)))
    .forEach((shift) => {
      const key = shiftBucket(shift, configuredShiftTypes);
      (merged[key] || (merged[key] = [])).push(shift);
    });

  return merged;
}
