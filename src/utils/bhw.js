// src/utils/bhw.js
//
// Helpers for the Midwife -> Barangay Health Worker (BHW) workflow.
//
// Real-world shape this models: the midwife doesn't hand medicine/vaccines
// directly to every patient herself. She hands a bulk quantity to a BHW
// (a volunteer covering a specific purok/zone), who administers it to
// patients over the following days/weeks and reports back later — often in
// aggregate ("gave to ~23 patients") since BHWs work from paper ITRs, not
// this system. This file has no Firestore calls itself — it's pure
// calculation, called by MidwifeBHW.jsx after it fetches the relevant docs.

/** Human-readable status + color for an allocation's remaining balance. */
export function getAllocationStatus(allocation) {
  const remaining = Number(allocation.quantityRemaining) || 0;
  const allocated = Number(allocation.quantityAllocated) || 0;
  if (remaining <= 0) return { label: "Fully Reported", color: "#065f46", bg: "#d1fae5" };
  if (remaining < allocated) return { label: "Partially Reported", color: "#92400e", bg: "#fef3c7" };
  return { label: "Awaiting Report", color: "#1e40af", bg: "#dbeafe" };
}

/**
 * Build a summary for one campaign (e.g. "MR-SIA 2026 Phase 1"): how much
 * was allocated to BHWs, how much has been reported used, how many distinct
 * children were reached (from per-patient logs + aggregate reports' counts
 * combined), total doses wasted, and coverage against the campaign's own
 * target if the midwife entered one.
 */
export function buildCampaignSummary(campaign, allocations, usageReports, immunizationLogs, dispenseLogs) {
  const campaignAllocations = allocations.filter(a => a.campaignId === campaign.id);
  const campaignUsageReports = usageReports.filter(r => r.campaignId === campaign.id);
  const campaignImmunLogs = immunizationLogs.filter(l => l.campaignId === campaign.id);
  const campaignDispenseLogs = dispenseLogs.filter(l => l.campaignId === campaign.id);

  const totalAllocated = campaignAllocations.reduce((s, a) => s + (Number(a.quantityAllocated) || 0), 0);

  // "Used" combines aggregate-reported quantities with whatever was logged
  // per-patient (vaccine doses given, or medicine boxes dispensed).
  const aggregateUsed = campaignUsageReports.reduce((s, r) => s + (Number(r.quantityUsed) || 0), 0);
  const perPatientVaccineUsed = campaignImmunLogs.reduce((s, l) => s + (Number(l.dosesGiven) || 0), 0);
  const perPatientMedicineUsed = campaignDispenseLogs.reduce((s, l) => s + (Number(l.boxesDispensed) || 0), 0);
  const totalUsed = aggregateUsed + perPatientVaccineUsed + perPatientMedicineUsed;

  // Children reached: distinct per-patient entries + aggregate reports'
  // self-reported children counts (can't dedupe across the two sources,
  // so this is a best-effort combined figure, not a guaranteed distinct
  // count — worth stating plainly rather than implying false precision).
  const perPatientChildrenIds = new Set(
    campaignImmunLogs.filter(l => l.patientType === "child" && l.patientId).map(l => l.patientId)
  );
  const aggregateChildren = campaignUsageReports.reduce((s, r) => s + (Number(r.childrenCount) || 0), 0);
  const childrenReached = perPatientChildrenIds.size + aggregateChildren;

  const dosesWasted = campaignImmunLogs.reduce((s, l) => s + (Number(l.dosesWasted) || 0), 0);

  const target = Number(campaign.targetPopulation) || 0;
  const coveragePercent = target > 0 ? Math.round((childrenReached / target) * 1000) / 10 : null;

  return {
    totalAllocated,
    totalUsed,
    totalRemaining: Math.max(0, totalAllocated - totalUsed),
    childrenReached,
    dosesWasted,
    target,
    coveragePercent,
    bhwCount: new Set(campaignAllocations.map(a => a.bhwId)).size,
  };
}

/** Is a campaign currently within its active date window? */
export function isCampaignActive(campaign) {
  const today = new Date().toISOString().slice(0, 10);
  return campaign.startDate <= today && (!campaign.endDate || campaign.endDate >= today);
}
