// src/components/shared/OfflineBanner.jsx
//
// A small, honest status banner: tells the user plainly when they've lost
// connection (so they know changes are being queued, not lost) and when
// they're back online. Firestore's own offline persistence (configured in
// src/firebase/config.js) is what actually keeps the app usable and queues
// writes — this component only communicates that state to the user.

import { useState, useEffect } from "react";

export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  // Show a brief "back online" confirmation, then auto-hide it, instead of
  // the banner just vanishing with no acknowledgement that syncing resumed.
  const [showReconnected, setShowReconnected] = useState(false);

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
      setShowReconnected(true);
      const timer = setTimeout(() => setShowReconnected(false), 4000);
      return () => clearTimeout(timer);
    }
    function handleOffline() {
      setIsOnline(false);
      setShowReconnected(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline && !showReconnected) return null;

  const offline = !isOnline;

  return (
    <div
      role="status"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: "8px 16px",
        textAlign: "center",
        fontSize: "13px",
        fontWeight: 600,
        color: "#fff",
        background: offline ? "#b45309" : "#166534",
        transition: "background 0.2s",
      }}
    >
      {offline
        ? "You're offline — you can keep working. Changes will sync automatically once you're reconnected."
        : "Back online — syncing any changes made while offline."}
    </div>
  );
}
