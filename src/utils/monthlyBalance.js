// src/utils/monthlyBalance.js
//
// Shared logic for the "Present End Balance" monthly reporting rule:
//   - Every RHU must submit an end-of-month inventory movement report before
//     CHO can approve/send a new replenishment to that RHU.
//   - Every Midwife (barangay) must submit the same before their RHU can
//     approve/send a new replenishment to them.
//
// Reports are stored in a single collection, "monthly_balance_reports",
// disambiguated by ownerType ("rhu" | "midwife") + ownerId (rhuId for RHUs,
// barangayName for Midwives — matching how inventory docs are already scoped
// in RHUInventory.jsx / MidwifeInventory.jsx).

import {
  collection, addDoc, getDocs, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";

export const BALANCE_REPORTS_COLLECTION = "monthly_balance_reports";

/** Some RHU accounts have a barangay incorrectly baked into their stored
 *  name (e.g. "RHU 10 - Babatnin"). This strips anything after " - " so
 *  balance-report messaging doesn't surface the wrong barangay. Only
 *  affects display text — never touches the stored value itself. */
export function displayFacilityName(name) {
  return String(name || "").split(" - ")[0].trim();
}

/** "YYYY-MM" for the month that just ended relative to `date`.
 *  This is the month whose end-balance report is due. e.g. if today is
 *  Sept 2, 2026, the report due is for August 2026. */
export function getPriorMonthKey(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Last `count` "YYYY-MM" keys, most recent first — for a month picker. */
export function recentMonthKeys(count = 6) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** "YYYY-MM" for the current, still-in-progress month. */
export function getCurrentMonthKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Human-readable label for a "YYYY-MM" key, e.g. "August 2026". */
export function monthKeyLabel(monthKey) {
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  return new Date(y, m - 1, 1).toLocaleString("default", { month: "long", year: "numeric" });
}

function normalizeId(v) {
  return String(v || "").trim().toLowerCase();
}

/** Fetch the FULL set of submitted balance report docs for a month, for a
 *  review UI (e.g. CHO reviewing every RHU's report, or RHU reviewing every
 *  Midwife's report) — as opposed to getSubmittedOwnerIds() which only
 *  returns ids for eligibility gating. */
export async function getAllSubmittedReports(ownerType, monthKey) {
  const q = query(
    collection(db, BALANCE_REPORTS_COLLECTION),
    where("ownerType", "==", ownerType),
    where("monthKey", "==", monthKey)
  );
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.ownerName || "").localeCompare(b.ownerName || ""));
}

/** Returns a Set of normalized ownerIds that HAVE submitted their end-balance
 *  report for the given monthKey. ownerType is "rhu" or "midwife". */
export async function getSubmittedOwnerIds(ownerType, monthKey) {
  const q = query(
    collection(db, BALANCE_REPORTS_COLLECTION),
    where("ownerType", "==", ownerType),
    where("monthKey", "==", monthKey)
  );
  const snap = await getDocs(q);
  return new Set(snap.docs.map(d => normalizeId(d.data().ownerId)));
}

/** Fetch the single balance report (if any) for a specific owner + month. */
export async function getBalanceReport(ownerType, ownerId, monthKey) {
  const q = query(
    collection(db, BALANCE_REPORTS_COLLECTION),
    where("ownerType", "==", ownerType),
    where("ownerId", "==", ownerId),
    where("monthKey", "==", monthKey)
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { id: d.id, ...d.data() };
}

/** Check whether a specific owner has already submitted for a month. */
export async function hasSubmittedBalance(ownerType, ownerId, monthKey) {
  const report = await getBalanceReport(ownerType, ownerId, monthKey);
  return !!report;
}

/**
 * Build the line-items for a balance report directly from a facility's
 * current live inventory list (already loaded in the calling component).
 * - openingBalance is estimated as (current remaining + dispensed-this-cycle),
 *   i.e. what remaining looked like before this month's movement. Since we
 *   don't retroactively track a true "opening" snapshot yet, this uses the
 *   simplest honest figure available: current remaining vs. original quantity.
 * - movementRate = how much of what they had has moved out. Slow movement
 *   (low rate) is exactly the signal CHO/RHU need to avoid over-distributing.
 */
export function buildBalanceItemsFromInventory(inventoryList) {
  return inventoryList.map(item => {
    const quantity = Number(item.quantity) || 0;
    const remaining = Number(item.remaining ?? item.quantity) || 0;
    const dispensed = Math.max(0, quantity - remaining);
    const movementRate = quantity > 0 ? Number(((dispensed / quantity) * 100).toFixed(1)) : 0;
    return {
      itemId: item.id,
      name: item.name || "Unnamed",
      lotNumber: item.lotNumber || "",
      isVaccine: !!item.isVaccine,
      openingBalance: quantity,
      dispensed,
      endBalance: remaining,
      movementRate, // % of stock that moved this cycle
    };
  });
}

/** Persist a submitted end-of-month balance report. */
export async function submitBalanceReport({ ownerType, ownerId, ownerName, monthKey, items, submittedBy }) {
  const totalEndBalance = items.reduce((s, it) => s + (Number(it.endBalance) || 0), 0);
  const slowMovingCount = items.filter(it => it.movementRate < 20).length;
  return addDoc(collection(db, BALANCE_REPORTS_COLLECTION), {
    ownerType,
    ownerId,
    ownerName: ownerName || "",
    monthKey,
    items,
    totalEndBalance,
    slowMovingCount,
    submittedBy: submittedBy || "",
    submittedAt: serverTimestamp(),
    status: "Submitted",
  });
}
