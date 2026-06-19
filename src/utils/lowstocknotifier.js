// lowStockNotifier.js
// Import this function and call it after any distribute or dispense action
// to automatically send a low stock notification if remaining drops too low.

import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";

/**
 * Call this after every distribute or dispense that changes `remaining`.
 *
 * @param {object} item       - the inventory item (needs: id, name, remaining, ownerType)
 * @param {string} role       - "cho" | "rhu" | "midwife"
 * @param {object} userData   - from useAuth() — needs rhuId, rhuName, barangayName as relevant
 */
export async function checkAndNotifyLowStock(item, role, userData) {
  const remaining = item.remaining ?? 0;
  const isLow      = remaining <= 50 && remaining > 20;
  const isCritical = remaining <= 20;

  if (!isLow && !isCritical) return; // still good, nothing to do

  const level   = isCritical ? "Critical" : "Low";
  const bg      = isCritical ? "danger"   : "warning";

  try {
    if (role === "cho") {
      // CHO notifies itself (shows on CHO notifications page)
      await addDoc(collection(db, "notifications"), {
        type:        "low-stock",
        level,
        title:       `${level} Stock Alert — ${item.name}`,
        message:     `CHO inventory for ${item.name} is ${level.toLowerCase()}. Only ${remaining} boxes remaining.`,
        fromType:    "cho",
        inventoryId: item.id,
        read:        false,
        createdAt:   serverTimestamp(),
      });
    }

    if (role === "rhu") {
      // RHU notifies itself
      await addDoc(collection(db, "notifications"), {
        type:        "low-stock",
        level,
        title:       `${level} Stock Alert — ${item.name}`,
        message:     `${userData?.rhuName} inventory for ${item.name} is ${level.toLowerCase()}. Only ${remaining} boxes remaining.`,
        toRhuId:     userData?.rhuId ?? "",
        toRhuName:   userData?.rhuName ?? "",
        fromType:    "rhu",
        inventoryId: item.id,
        read:        false,
        createdAt:   serverTimestamp(),
      });
    }

    if (role === "midwife") {
      // Midwife notifies itself AND sends alert to RHU
      await addDoc(collection(db, "notifications"), {
        type:           "low-stock",
        level,
        title:          `${level} Stock Alert — ${item.name}`,
        message:        `Barangay ${userData?.barangayName} inventory for ${item.name} is ${level.toLowerCase()}. Only ${remaining} boxes remaining. Consider requesting resupply from RHU.`,
        toBarangayName: userData?.barangayName ?? "",
        fromType:       "midwife",
        inventoryId:    item.id,
        read:           false,
        createdAt:      serverTimestamp(),
      });
    }
  } catch (err) {
    console.error("Low stock notification error:", err);
  }
}