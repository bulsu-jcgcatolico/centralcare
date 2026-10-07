// src/hooks/useUnreadMessageCount.js
//
// Reusable hook for an unread-MESSAGES sidebar badge. This is separate from
// useUnreadCount (which only tracks the `notifications` collection) because
// messages use a different "unread" convention entirely: there's no
// server-side `read` flag on a message doc. Instead, each browser remembers
// a per-thread "last opened" timestamp in localStorage — the same
// `centralcare_lastRead_<threadId>` key CHOMessages.jsx, RHUMessages.jsx,
// and MidwifeMessages.jsx already write to whenever a thread is opened.
//
// A thread counts as unread here if its latest message was sent by the
// OTHER party and is newer than that stored timestamp.
//
// Usage: const unreadMessages = useUnreadMessageCount();

import { useState, useEffect } from "react";
import {
  collection, query, where, orderBy, limit, onSnapshot,
  getDocs, doc, getDoc,
} from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../context/AuthContext";

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";
const BARANGAYS_COLLECTION = "cho_barangays";
const readKey = (threadId) => `centralcare_lastRead_${threadId}`;

const ROLE_SENDER_LABEL = {
  cho: "CHO Administrator",
  rhu: "RHU Staff",
  midwife: "Barangay Midwife",
};

export function useUnreadMessageCount() {
  const { userData } = useAuth();
  const [threadIds, setThreadIds] = useState([]);
  const [unreadThreads, setUnreadThreads] = useState(new Set());

  // Step 1 — resolve which thread IDs belong to this user. This mirrors the
  // exact contact-resolution logic each Messages page already runs, so the
  // thread IDs here always agree with the ones those pages actually use.
  useEffect(() => {
    if (!userData?.role) { setThreadIds([]); return; }
    let cancelled = false;

    async function resolveThreadIds() {
      const role = userData.role;

      // CHO always talks to a fixed RHU 1–10 roster — no lookup needed.
      if (role === "cho") {
        const ids = Array.from({ length: 10 }, (_, i) => `cho_rhu_${i + 1}`);
        if (!cancelled) setThreadIds(ids);
        return;
      }

      // RHU talks to CHO plus every barangay assigned to it.
      if (role === "rhu") {
        const rhuNumber = String(userData.rhuId ?? "").match(/\d+/)?.[0] ?? "";
        const currentRhuId = `rhu_${rhuNumber}`;
        const ids = [`cho_${currentRhuId}`];
        try {
          let assignedKeys = [];
          if (rhuNumber) {
            const regSnap = await getDoc(doc(db, RHU_REGISTRY_COLLECTION, String(rhuNumber)));
            if (regSnap.exists()) assignedKeys = regSnap.data().assignedBarangays || [];
          }
          if (assignedKeys.length === 0) {
            const allRegSnap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
            allRegSnap.docs.forEach((d) => {
              const data = d.data();
              const dRhuId = String(data.rhuId || "").trim().toLowerCase();
              if (dRhuId === String(rhuNumber)) assignedKeys = data.assignedBarangays || [];
            });
          }
          const normalizedKeys = assignedKeys.map((k) => String(k).trim().toLowerCase());
          const allSnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
          allSnap.docs.forEach((d) => {
            const data = d.data();
            const bName = String(data.barangayName || data.name || "").trim().toLowerCase();
            const bId = String(d.id).trim().toLowerCase();
            const bRhuId = String(data.rhuId || data.assignedRhuId || "").trim().toLowerCase();
            const inRegistry = normalizedKeys.includes(bName) || normalizedKeys.includes(bId);
            const directMatch = rhuNumber && bRhuId === String(rhuNumber);
            if (inRegistry || directMatch) ids.push(`${currentRhuId}_brgy_${d.id}`);
          });
        } catch (err) {
          console.error("useUnreadMessageCount: error resolving RHU threads", err);
        }
        if (!cancelled) setThreadIds(ids);
        return;
      }

      // Midwife has exactly one thread: their assigned parent RHU.
      if (role === "midwife") {
        const currentBrgyName = userData.barangayName || "";
        try {
          const brgySnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
          let brgyId = currentBrgyName.replace(/\s+/g, "_").toLowerCase();
          brgySnap.docs.forEach((d) => {
            const data = d.data();
            const name = String(data.barangayName || data.name || d.id).trim().toLowerCase();
            if (name === currentBrgyName.trim().toLowerCase()) brgyId = d.id;
          });

          let rhuNum = null;
          const regSnap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
          regSnap.docs.forEach((d) => {
            if (rhuNum) return;
            const data = d.data();
            const barangays = data.assignedBarangays || [];
            const has = barangays.some(
              (b) => String(b).trim().toLowerCase() === currentBrgyName.trim().toLowerCase()
            );
            if (has) {
              const raw = data.rhuId ?? d.id;
              rhuNum = String(raw).match(/\d+/)?.[0] || String(d.id).match(/\d+/)?.[0];
            }
          });

          if (rhuNum && !cancelled) {
            setThreadIds([`rhu_${rhuNum}_brgy_${brgyId}`]);
          } else if (!cancelled) {
            setThreadIds([]);
          }
        } catch (err) {
          console.error("useUnreadMessageCount: error resolving Midwife thread", err);
        }
        return;
      }

      if (!cancelled) setThreadIds([]);
    }

    resolveThreadIds();
    return () => { cancelled = true; };
  }, [userData?.role, userData?.rhuId, userData?.barangayName]);

  // Step 2 — for each resolved thread, listen for its latest message and
  // check it against this browser's stored "last read" time for that thread.
  useEffect(() => {
    if (threadIds.length === 0) { setUnreadThreads(new Set()); return; }

    const myLabel = ROLE_SENDER_LABEL[userData?.role] || "";

    const unsubscribers = threadIds.map((tId) => {
      const q = query(
        collection(db, "messages"),
        where("threadId", "==", tId),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      return onSnapshot(q, (snap) => {
        if (snap.empty) return;
        const data = snap.docs[0].data({ serverTimestamps: "estimate" });
        const lastRead = Number(localStorage.getItem(readKey(tId)) || 0);
        const msgTime = data.timestamp?.toDate ? data.timestamp.toDate().getTime() : Date.now();
        const fromSomeoneElse = data.senderRole !== myLabel;

        setUnreadThreads((prev) => {
          const next = new Set(prev);
          if (fromSomeoneElse && msgTime > lastRead) next.add(tId);
          else next.delete(tId);
          return next;
        });
      }, (err) => {
        console.error("useUnreadMessageCount: listener error for thread", tId, err);
      });
    });

    return () => unsubscribers.forEach((u) => u());
  }, [threadIds, userData?.role]);

  const count = unreadThreads.size;
  return count > 9 ? "9+" : count > 0 ? String(count) : null;
}