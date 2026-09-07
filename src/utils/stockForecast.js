// src/utils/stockForecast.js
//
// Predictive stock-out forecasting, shared across CHO, RHU, and Midwife.
//
// Method: trailing simple moving average.
//   average daily consumption = total moved out in the last N days ÷ N
//   estimated days remaining  = current remaining stock ÷ average daily consumption
//
// "Consumption" means something different at each tier:
//   - Midwife: real patient dispensing        -> dispense_logs      (boxesDispensed)
//   - RHU:     what moves out to barangays    -> rhu_distributions  (totalBoxes)
//   - CHO:     what moves out to RHUs         -> distributions      (totalBoxes)
//
// Daily logs are preferred (more precise, reacts faster to recent trends).
// When there isn't enough daily-log history for an item yet, we fall back to
// the most recent monthly_balance_reports submission, which already computes
// a per-item `dispensed` figure for its reporting month.

export const CONSUMPTION_WINDOW_DAYS = 30;
export const CRITICAL_DAYS_THRESHOLD = 7;   // < this many days left -> "critical"
export const REORDER_DAYS_THRESHOLD = 21;   // < this many days left -> "reorder soon"

/** Best-effort date extraction from a log doc: prefers a Firestore Timestamp
 *  field, falls back to a plain "date" string field. Returns null if neither
 *  can be parsed, so callers can skip that log rather than mis-date it. */
function getLogDate(log, timestampField) {
  const ts = log[timestampField];
  if (ts?.seconds) return new Date(ts.seconds * 1000);
  if (log.date) {
    const d = new Date(log.date);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

function isSameItem(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function daysInMonth(monthKey) {
  const [y, m] = String(monthKey || "").split("-").map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/**
 * Sum how much of a given item moved out in the trailing window, from a list
 * of log docs (dispense_logs / rhu_distributions / distributions).
 */
function dailyRateFromLogs(logs, itemName, { nameField, qtyField, timestampField, windowDays }) {
  const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
  let total = 0;
  let sampleCount = 0;

  for (const log of logs) {
    if (!isSameItem(log[nameField], itemName)) continue;
    const logDate = getLogDate(log, timestampField);
    if (!logDate || logDate.getTime() < cutoff) continue;
    total += Number(log[qtyField]) || 0;
    sampleCount += 1;
  }

  if (sampleCount === 0) return null;
  return { dailyRate: total / windowDays, sampleCount, source: "daily-logs" };
}

/**
 * Fallback: derive a daily rate from the most recent submitted
 * monthly_balance_reports doc for this owner, using that item's `dispensed`
 * figure divided by the number of days in that reporting month.
 */
function dailyRateFromMonthlyReports(monthlyReports, itemName) {
  if (!monthlyReports || monthlyReports.length === 0) return null;

  // Reports are expected sorted most-recent-first by the caller; just in
  // case, sort defensively here too.
  const sorted = [...monthlyReports].sort((a, b) => (b.monthKey || "").localeCompare(a.monthKey || ""));

  for (const report of sorted) {
    const item = (report.items || []).find(it => isSameItem(it.name, itemName));
    if (item && Number(item.dispensed) > 0) {
      return {
        dailyRate: Number(item.dispensed) / daysInMonth(report.monthKey),
        sampleCount: 1,
        source: "monthly-report",
        monthKey: report.monthKey,
      };
    }
  }
  return null;
}

/** Classify a single item's forecast given its remaining stock and a
 *  computed daily consumption rate. */
function classify({ remaining, dailyRate, expiry }) {
  const rem = Number(remaining) || 0;

  if (rem <= 0) {
    return { daysRemaining: 0, status: "critical", hasData: true, wasteRisk: false };
  }
  if (!dailyRate || dailyRate <= 0) {
    return { daysRemaining: null, status: "insufficient-data", hasData: false, wasteRisk: false };
  }

  const daysRemaining = rem / dailyRate;
  const status =
    daysRemaining < CRITICAL_DAYS_THRESHOLD ? "critical" :
    daysRemaining < REORDER_DAYS_THRESHOLD ? "reorder" : "healthy";

  let wasteRisk = false;
  let daysUntilExpiry = null;
  if (expiry) {
    const expiryDate = new Date(expiry);
    if (!isNaN(expiryDate.getTime())) {
      daysUntilExpiry = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      // Will sit on the shelf past its own expiry before it's ever used up.
      wasteRisk = daysUntilExpiry > 0 && daysUntilExpiry < daysRemaining;
    }
  }

  return { daysRemaining, status, hasData: true, wasteRisk, daysUntilExpiry };
}

/**
 * Build a full forecast list for a facility's inventory.
 *
 * @param inventoryItems  live inventory array (each needs name, remaining/quantity, expiry)
 * @param logs            trailing daily-log docs (dispense_logs / rhu_distributions / distributions)
 * @param monthlyReports  this facility's own monthly_balance_reports docs (any order)
 * @param fieldMap        { nameField, qtyField, timestampField } - which fields to read on `logs`
 */
export function buildForecastList(inventoryItems, logs, monthlyReports, fieldMap) {
  const { nameField, qtyField, timestampField, windowDays = CONSUMPTION_WINDOW_DAYS } = fieldMap;

  return inventoryItems.map(item => {
    const remaining = item.remaining ?? item.quantity ?? 0;
    const fromLogs = dailyRateFromLogs(logs, item.name, { nameField, qtyField, timestampField, windowDays });
    const rate = fromLogs || dailyRateFromMonthlyReports(monthlyReports, item.name);
    const forecast = classify({ remaining, dailyRate: rate?.dailyRate, expiry: item.expiry });

    return {
      itemId: item.id,
      name: item.name,
      lotNumber: item.lotNumber || "",
      remaining,
      isVaccine: !!item.isVaccine,
      dailyRate: rate?.dailyRate ?? 0,
      rateSource: rate?.source ?? "none",
      ...forecast,
    };
  });
}

/** The subset worth surfacing on a dashboard widget: anything critical or
 *  due for reorder, most urgent first. Caller decides how many to show. */
export function getUrgentForecasts(forecastList, limit = 5) {
  return forecastList
    .filter(f => f.status === "critical" || f.status === "reorder")
    .sort((a, b) => (a.daysRemaining ?? Infinity) - (b.daysRemaining ?? Infinity))
    .slice(0, limit);
}

/** Items that will expire before they're ever used up, regardless of their
 *  stock-out urgency — a distinct "waste risk" view. */
export function getWasteRiskForecasts(forecastList, limit = 5) {
  return forecastList
    .filter(f => f.wasteRisk)
    .sort((a, b) => (a.daysUntilExpiry ?? Infinity) - (b.daysUntilExpiry ?? Infinity))
    .slice(0, limit);
}

export const FIELD_MAPS = {
  midwife: { nameField: "medicineName", qtyField: "boxesDispensed", timestampField: "dispensedAt" },
  rhu:     { nameField: "medicineName", qtyField: "totalBoxes",     timestampField: "createdAt" },
  cho:     { nameField: "medicineName", qtyField: "totalBoxes",     timestampField: "createdAt" },
};
