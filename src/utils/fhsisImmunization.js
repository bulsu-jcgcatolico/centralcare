// src/utils/fhsisImmunization.js
//
// Reference data and calculations for DOH FHSIS-aligned immunization
// reporting. This models the standard Expanded Program on Immunization (EPI)
// schedule for children under 1 year old.
//
// IMPORTANT: DOH periodically revises the exact FHSIS form fields and the
// official "Fully Immunized Child" (FIC) definition. This uses the widely
// recognized traditional definition (BCG + HepB birth dose + Penta1-3 +
// OPV1-3 + MCV1). PCV is tracked and reported as its own column since it's
// part of the newer schedule, but is not required for the FIC count here.
// Verify against the current DOH FHSIS manual if exact compliance matters
// for a defense or real deployment — this is a reasonable, transparent
// approximation, not a legal replica of the official form.

// Canonical antigen categories a vaccine batch can be tagged as. "other"
// covers any vaccine outside the standard EPI schedule (e.g. anti-rabies,
// tetanus toxoid, flu) — those are still dispensed and tracked normally,
// they just don't appear in the FHSIS antigen columns.
export const FHSIS_ANTIGENS = {
  bcg:   { label: "BCG",         doseOptions: ["Dose"] },
  hepb:  { label: "Hepatitis B", doseOptions: ["Birth Dose"] },
  penta: { label: "Pentavalent (DPT-HepB-Hib)", doseOptions: ["1st Dose", "2nd Dose", "3rd Dose"] },
  opv:   { label: "OPV",         doseOptions: ["1st Dose", "2nd Dose", "3rd Dose"] },
  pcv:   { label: "PCV",         doseOptions: ["1st Dose", "2nd Dose", "3rd Dose"] },
  mcv:   { label: "MCV (Measles-containing)", doseOptions: ["MCV1", "MCV2"] },
  other: { label: "Other / Not FHSIS-tracked", doseOptions: ["Dose"] },
};

export const FHSIS_ANTIGEN_ORDER = ["bcg", "hepb", "penta", "opv", "pcv", "mcv"];

/** Dose options for a given antigen key, for the Vaccination Session dose
 *  dropdown. Falls back to a generic single "Dose" if the antigen is
 *  unrecognized (defensive — should not normally happen). */
export function getDoseOptionsForAntigen(antigenKey) {
  return FHSIS_ANTIGENS[antigenKey]?.doseOptions || ["Dose"];
}

/** The full basic schedule required for the "Fully Immunized Child" count —
 *  one required (antigen, doseLabel) pair per line. See file header note on
 *  why PCV and MCV2 are excluded from this specific definition. */
const FIC_REQUIRED_DOSES = [
  { antigen: "bcg",   doseLabel: "Dose" },
  { antigen: "hepb",  doseLabel: "Birth Dose" },
  { antigen: "penta", doseLabel: "1st Dose" },
  { antigen: "penta", doseLabel: "2nd Dose" },
  { antigen: "penta", doseLabel: "3rd Dose" },
  { antigen: "opv",   doseLabel: "1st Dose" },
  { antigen: "opv",   doseLabel: "2nd Dose" },
  { antigen: "opv",   doseLabel: "3rd Dose" },
  { antigen: "mcv",   doseLabel: "MCV1" },
];

/**
 * Aggregate a barangay's full immunization_logs history (not just one
 * month) by patient, then determine which children became "fully
 * immunized" — completed every dose in FIC_REQUIRED_DOSES — and in which
 * month their completing (last required) dose was given.
 *
 * @param allLogs  every immunization_logs doc for this barangay, any month
 * @returns Map<patientId, { patientName, completedMonthKey }>
 */
export function computeFullyImmunizedChildren(allLogs) {
  const byPatient = {};
  for (const log of allLogs) {
    if (!log.patientId || log.patientType !== "child") continue;
    if (!log.fhsisAntigen || !log.doseLabel) continue;
    // SIA/campaign doses (e.g. MR-SIA) are reported as a separate DOH
    // indicator from routine coverage — a campaign dose given regardless of
    // prior vaccination status would otherwise double-count or distort the
    // routine Fully Immunized Child figure. See MidwifeBHW.jsx for where
    // campaign-specific coverage is reported instead.
    if (log.campaignId) continue;
    if (!byPatient[log.patientId]) byPatient[log.patientId] = { patientName: log.patientName, doses: [] };
    byPatient[log.patientId].doses.push({
      antigen: log.fhsisAntigen,
      doseLabel: log.doseLabel,
      monthKey: log.monthKey,
    });
  }

  const result = new Map();
  for (const [patientId, data] of Object.entries(byPatient)) {
    const givenSet = new Set(data.doses.map(d => `${d.antigen}|${d.doseLabel}`));
    const hasAll = FIC_REQUIRED_DOSES.every(req => givenSet.has(`${req.antigen}|${req.doseLabel}`));
    if (!hasAll) continue;

    // The month they "became" fully immunized = the month of the LAST
    // required dose they received (chronologically last monthKey among
    // their required doses).
    const requiredMonthKeys = data.doses
      .filter(d => FIC_REQUIRED_DOSES.some(req => req.antigen === d.antigen && req.doseLabel === d.doseLabel))
      .map(d => d.monthKey)
      .filter(Boolean)
      .sort();
    const completedMonthKey = requiredMonthKeys[requiredMonthKeys.length - 1] || null;

    result.set(patientId, { patientName: data.patientName, completedMonthKey });
  }
  return result;
}

/**
 * Build the antigen-by-dose coverage table for a single reporting month —
 * how many doses of each antigen/dose-number were given that month, plus
 * the FIC count for children who completed their schedule that month.
 */
export function buildImmunizationCoverageReport(monthLogs, allLogsForFIC, monthKey) {
  const coverage = {};
  FHSIS_ANTIGEN_ORDER.forEach(key => {
    coverage[key] = {};
    FHSIS_ANTIGENS[key].doseOptions.forEach(dose => { coverage[key][dose] = 0; });
  });

  monthLogs.forEach(log => {
    if (!log.fhsisAntigen || !FHSIS_ANTIGEN_ORDER.includes(log.fhsisAntigen)) return;
    if (!log.doseLabel) return;
    if (log.campaignId) return; // SIA doses reported separately — see note above
    if (coverage[log.fhsisAntigen][log.doseLabel] === undefined) return;
    coverage[log.fhsisAntigen][log.doseLabel] += Number(log.dosesGiven) || 0;
  });

  const ficMap = computeFullyImmunizedChildren(allLogsForFIC);
  const ficThisMonth = [...ficMap.values()].filter(c => c.completedMonthKey === monthKey);

  return { coverage, ficCount: ficThisMonth.length, ficChildren: ficThisMonth };
}

/**
 * Standard DOH-style estimate for the annual target population (surviving
 * infants under 1 year old) when exact live-birth registry data isn't
 * available: total barangay population × estimated crude birth rate.
 * ~2.7% is a commonly cited Philippine national estimate — adjust this
 * constant if your RHU/CHO has a more accurate local birth rate on file.
 */
export const ESTIMATED_BIRTH_RATE = 0.027;

/** DOH's commonly cited coverage benchmark for full immunization / measles
 *  containing vaccine coverage (herd-immunity threshold). Used only to color
 *  the report — not a legal or contractual figure. */
export const DOH_COVERAGE_TARGET_PERCENT = 95;

export function computeTargetPopulation(totalPopulation) {
  return Math.round((Number(totalPopulation) || 0) * ESTIMATED_BIRTH_RATE);
}

/** Count of distinct children (by patientId) who received a specific
 *  (antigen, doseLabel) at any point from the start of `year` through
 *  `throughMonthKey` (inclusive) — a year-to-date completion count, which is
 *  how DOH coverage indicators are normally reported (cumulative for the
 *  year, not a single month's snapshot). */
export function computeYTDAntigenCoverage(allLogs, antigenKey, doseLabel, year, throughMonthKey) {
  const seen = new Set();
  for (const log of allLogs) {
    if (log.patientType !== "child") continue;
    if (log.fhsisAntigen !== antigenKey || log.doseLabel !== doseLabel) continue;
    if (log.campaignId) continue; // SIA doses reported separately — see note above
    if (!log.monthKey || !log.monthKey.startsWith(`${year}-`)) continue;
    if (log.monthKey > throughMonthKey) continue;
    if (log.patientId) seen.add(log.patientId);
  }
  return seen.size;
}

/** Year-to-date Fully Immunized Child count: children whose FIC-completing
 *  dose fell within Jan of `year` through `throughMonthKey`. */
export function computeYTDFullyImmunized(allLogs, year, throughMonthKey) {
  const ficMap = computeFullyImmunizedChildren(allLogs);
  let count = 0;
  for (const child of ficMap.values()) {
    if (!child.completedMonthKey) continue;
    if (!child.completedMonthKey.startsWith(`${year}-`)) continue;
    if (child.completedMonthKey > throughMonthKey) continue;
    count += 1;
  }
  return count;
}

/** The "completion dose" per antigen — the dose that actually indicates a
 *  child is protected, which is what DOH coverage indicators track (not
 *  intermediate doses like Penta 1st/2nd). */
export const COVERAGE_INDICATORS = [
  { key: "bcg",   doseLabel: "Dose",       label: "BCG" },
  { key: "hepb",  doseLabel: "Birth Dose", label: "Hepatitis B (birth dose)" },
  { key: "penta", doseLabel: "3rd Dose",   label: "Pentavalent 3rd Dose" },
  { key: "opv",   doseLabel: "3rd Dose",   label: "OPV 3rd Dose" },
  { key: "pcv",   doseLabel: "3rd Dose",   label: "PCV 3rd Dose" },
  { key: "mcv",   doseLabel: "MCV1",       label: "MCV1" },
];

/** Build the full coverage-vs-target report for a barangay for a given
 *  year, through a given month. */
export function buildCoverageReport(allLogs, totalPopulation, year, throughMonthKey) {
  const targetPopulation = computeTargetPopulation(totalPopulation);

  const rows = COVERAGE_INDICATORS.map(ind => {
    const covered = computeYTDAntigenCoverage(allLogs, ind.key, ind.doseLabel, year, throughMonthKey);
    const percent = targetPopulation > 0 ? Math.round((covered / targetPopulation) * 1000) / 10 : 0;
    return { ...ind, covered, targetPopulation, percent, meetsTarget: percent >= DOH_COVERAGE_TARGET_PERCENT };
  });

  const ficCovered = computeYTDFullyImmunized(allLogs, year, throughMonthKey);
  const ficPercent = targetPopulation > 0 ? Math.round((ficCovered / targetPopulation) * 1000) / 10 : 0;

  return {
    targetPopulation,
    rows,
    fic: { covered: ficCovered, targetPopulation, percent: ficPercent, meetsTarget: ficPercent >= DOH_COVERAGE_TARGET_PERCENT },
  };
}
