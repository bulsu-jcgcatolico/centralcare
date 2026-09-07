// src/utils/vaccineWastage.js
//
// Shared helpers for tracking vaccine dispensing and wastage.
//
// Inventory items that are vaccines carry three extra fields (added wherever
// batches/inventory are created — CHO batch add, RHU manual add, Midwife
// shipment log — and propagated automatically through the CHO -> RHU -> Midwife
// distribution chain):
//   isVaccine:      boolean
//   doseType:       "single" | "multi"
//   dosesPerVial:   number (only meaningful when doseType === "multi"; treated
//                   as 1 for single-dose vaccines)
//
// Stock quantity/remaining for a vaccine item is counted in VIALS, not boxes.

/** Doses available in a given number of vials, for either dose type. */
export function dosesAvailable({ doseType, dosesPerVial, vials }) {
  const perVial = doseType === "multi" ? (Number(dosesPerVial) || 1) : 1;
  return (Number(vials) || 0) * perVial;
}

/**
 * Compute the result of a single vaccination session/dispensing event.
 * - Single-dose: each vial is opened for exactly one recipient. Wastage only
 *   occurs if a vial is opened (counted as used) but the dose isn't actually
 *   given (e.g. spoiled, patient no-show after opening).
 * - Multi-dose: once a vial is opened it can't be resealed for another day in
 *   most field settings, so any doses in an opened vial beyond what's given
 *   in that session are wastage (e.g. a 10-dose measles vial opened for 3
 *   children wastes 7 doses).
 */
export function calculateDoseWastage({ doseType, dosesPerVial, vialsUsed, dosesGiven }) {
  const totalDosesAvailable = dosesAvailable({ doseType, dosesPerVial, vials: vialsUsed });
  const given = Math.max(0, Number(dosesGiven) || 0);
  const dosesWasted = Math.max(0, totalDosesAvailable - given);
  const wastagePercent = totalDosesAvailable > 0
    ? Number(((dosesWasted / totalDosesAvailable) * 100).toFixed(1))
    : 0;
  return { totalDosesAvailable, dosesGiven: given, dosesWasted, wastagePercent };
}

/** Aggregate wastage across a list of immunization_logs entries (e.g. for a
 *  monthly report), grouped by vaccine name. */
export function summarizeWastageByVaccine(logs) {
  const byVaccine = {};
  for (const log of logs) {
    const key = log.vaccineName || "Unknown";
    if (!byVaccine[key]) {
      byVaccine[key] = {
        vaccineName: key,
        doseType: log.doseType,
        vialsUsed: 0,
        dosesGiven: 0,
        dosesWasted: 0,
        childrenServed: 0,
        adultsServed: 0,
      };
    }
    const entry = byVaccine[key];
    entry.vialsUsed += Number(log.vialsUsed) || 0;
    entry.dosesGiven += Number(log.dosesGiven) || 0;
    entry.dosesWasted += Number(log.dosesWasted) || 0;
    if (log.patientType === "child") entry.childrenServed += Number(log.dosesGiven) || 0;
    if (log.patientType === "adult") entry.adultsServed += Number(log.dosesGiven) || 0;
  }
  return Object.values(byVaccine).map(e => ({
    ...e,
    wastagePercent: (e.dosesGiven + e.dosesWasted) > 0
      ? Number(((e.dosesWasted / (e.dosesGiven + e.dosesWasted)) * 100).toFixed(1))
      : 0,
  }));
}
