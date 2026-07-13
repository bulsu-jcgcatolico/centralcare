import {
  collection, addDoc, getDocs, query, where, serverTimestamp
} from "firebase/firestore";
import { db } from "../firebase/config";

// How many days before expiry to start warning.
const EXPIRY_WARNING_DAYS = 30;

/**
 * Checks a single inventory item's expiry date and creates a notification
 * if it's expiring soon or has already expired. Safe to call repeatedly —
 * it checks for an existing matching notification first so it won't spam
 * duplicates every time inventory is loaded.
 *
 * @param {object} item - inventory item, must have id, name, expiry
 * @param {"cho"|"rhu"|"midwife"} ownerType
 * @param {object} contextData - { rhuId, rhuName, barangayName } as applicable
 */
export async function checkAndNotifyExpiry(item, ownerType, contextData = {}) {
  if (!item?.expiry || !item?.id) return;

  const daysLeft = Math.ceil(
    (new Date(item.expiry) - new Date()) / (1000 * 60 * 60 * 24)
  );
  if (daysLeft > EXPIRY_WARNING_DAYS) return; // not close enough yet

  const status = daysLeft < 0 ? "expired" : "expiring";

  try {
    // Avoid duplicate notifications for the same item + status
    const q = query(
      collection(db, "notifications"),
      where("type", "==", "expiry"),
      where("inventoryId", "==", item.id),
      where("expiryStatus", "==", status)
    );
    const existing = await getDocs(q);
    if (!existing.empty) return; // already notified for this status

    const message = status === "expired"
      ? `${item.name} has expired (expiry date: ${item.expiry}). Please remove or dispose of remaining stock.`
      : `${item.name} is expiring in ${daysLeft} day${daysLeft === 1 ? "" : "s"} (expiry date: ${item.expiry}). Plan to use or redistribute remaining stock.`;

    await addDoc(collection(db, "notifications"), {
      type: "expiry",
      expiryStatus: status,
      title: status === "expired" ? "Medicine Expired" : "Medicine Expiring Soon",
      message,
      inventoryId: item.id,
      medicineName: item.name,
      lotNumber: item.lotNumber ?? "",
      ownerType,
      rhuId: contextData?.rhuId ?? null,
      rhuName: contextData?.rhuName ?? null,
      barangayName: contextData?.barangayName ?? null,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error("Expiry notification check failed:", err);
  }
}

/**
 * Runs checkAndNotifyExpiry over a full inventory list. Call this after
 * loading inventory so items are re-checked every time the page loads
 * (not just when an item is first added).
 */
export async function runExpiryChecks(items, ownerType, contextData = {}) {
  for (const item of items) {
    await checkAndNotifyExpiry(item, ownerType, contextData);
  }
}