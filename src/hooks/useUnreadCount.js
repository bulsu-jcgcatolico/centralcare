// src/hooks/useUnreadCount.js
// Reusable hook to get unread notification count for sidebar badge
// Usage: const unreadCount = useUnreadCount();

import { useState, useEffect } from "react";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

export function useUnreadCount() {
  const { userData } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!userData) return;

    let q;
    const role = userData.role;

    if (role === "cho") {
      // CHO only sees low-stock notifications
      q = query(
        collection(db, "notifications"),
        where("type", "==", "low-stock"),
        where("fromType", "==", "cho"),
        where("read", "==", false)
      );
    } else if (role === "rhu") {
      // RHU sees CHO distributions + low stock
      q = query(
        collection(db, "notifications"),
        where("toRhuId", "==", userData.rhuId ?? ""),
        where("read", "==", false)
      );
    } else if (role === "midwife") {
      // Midwife sees RHU distributions + low stock
      q = query(
        collection(db, "notifications"),
        where("toBarangayName", "==", userData.barangayName ?? ""),
        where("read", "==", false)
      );
    } else {
      return;
    }

    // Real-time listener so badge updates instantly
    const unsub = onSnapshot(q, (snap) => {
      setCount(snap.size);
    });

    return () => unsub();
  }, [userData]);

  // Cap at 9, show "9+" if more
  return count > 9 ? "9+" : count > 0 ? String(count) : null;
}