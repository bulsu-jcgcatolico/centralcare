import { useState, useEffect, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, addDoc, query, where, orderBy, onSnapshot, serverTimestamp, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./MidwifeMessages.css";

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";
const BARANGAYS_COLLECTION = "cho_barangays";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "BHW & Campaigns", to: "/midwife/bhw"         },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
];

const readKey = (threadId) => `centralcare_lastRead_${threadId}`;

function formatTime(ts) {
  if (!ts) return "";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Some records have extra text accidentally appended (e.g. "RHU 10 - Longos").
// Strip anything after a dash so names always render clean, regardless of source data.
function cleanName(name) {
  if (!name) return "";
  return String(name).split(/[-–—]/)[0].trim();
}

export default function MidwifeMessages() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const currentBrgyName = userData?.barangayName || "Longos";

  // assignedRhu.id must match the "rhu_N" format RHUMessages.jsx uses (e.g. "rhu_10"),
  // and currentBrgyId must match the exact "brgy_<firestoreDocId>" contact id RHUMessages.jsx
  // builds for this barangay — otherwise the two sides silently write to different threads.
  const [assignedRhu, setAssignedRhu] = useState({ id: "rhu_10", name: "RHU 10" });
  const [currentBrgyId, setCurrentBrgyId] = useState("");
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const messagesEndRef = useRef(null);
  const messagesCacheRef = useRef({});

  function handleLogout() { logout(); navigate("/"); }

  // Resolve this midwife's own barangay doc ID + their parent RHU's rhu_N id, both from
  // the same source data RHUMessages.jsx reads, so the two sides always agree on the thread ID.
  useEffect(() => {
    async function resolveIds() {
      try {
        // 1. Find this barangay's real Firestore doc ID in cho_barangays.
        const brgySnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
        let myBrgyDoc = null;
        brgySnap.docs.forEach((d) => {
          const data = d.data();
          const name = String(data.barangayName || data.name || d.id).trim().toLowerCase();
          if (name === currentBrgyName.trim().toLowerCase()) {
            myBrgyDoc = { id: d.id, ...data };
          }
        });
        const brgyId = myBrgyDoc
          ? `brgy_${myBrgyDoc.id}`
          : `brgy_${currentBrgyName.replace(/\s+/g, "_").toLowerCase()}`;
        setCurrentBrgyId(brgyId);

        // 2. Find the RHU registry entry that lists this barangay as assigned, and extract
        //    its RHU number so we can build the same "rhu_N" id RHUMessages.jsx uses.
        const regSnap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
        let found = false;
        regSnap.docs.forEach((docSnap) => {
          if (found) return;
          const data = docSnap.data();
          const barangays = data.assignedBarangays || [];
          const hasThisBrgy = barangays.some(
            (b) => String(b).trim().toLowerCase() === currentBrgyName.trim().toLowerCase()
          );
          if (hasThisBrgy) {
            const raw = data.rhuId ?? docSnap.id;
            const numMatch = String(raw).match(/\d+/) || String(docSnap.id).match(/\d+/);
            const num = numMatch ? numMatch[0] : null;
            if (num) {
              setAssignedRhu({ id: `rhu_${num}`, name: cleanName(data.rhuName) || `RHU ${num}` });
              found = true;
            }
          }
        });
      } catch (err) {
        console.error("Error resolving RHU/barangay IDs for midwife messages: ", err);
      }
    }

    resolveIds();
  }, [currentBrgyName]);

  // Midwife exclusively talks to their assigned parent RHU
  const threadId = assignedRhu.id && currentBrgyId ? `${assignedRhu.id}_${currentBrgyId}` : "";

  useEffect(() => {
    if (!threadId) return;

    // Show cached messages immediately (no blank flash) while the fresh snapshot loads in.
    setMessages(messagesCacheRef.current[threadId] || []);

    const q = query(
      collection(db, "messages"),
      where("threadId", "==", threadId),
      orderBy("timestamp", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data({ serverTimestamps: "estimate" }), // avoids null-timestamp reorder flicker on send
      }));
      messagesCacheRef.current[threadId] = list;
      setMessages(list);
      scrollToBottom();
      localStorage.setItem(readKey(threadId), String(Date.now()));
    }, (error) => {
      console.error("Midwife message listener error: ", error);
    });

    return () => unsubscribe();
  }, [threadId]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!newMessage.trim() || !threadId) return;

    const textPayload = newMessage.trim();
    setNewMessage("");

    // OPTIMISTIC UPDATE: bubble appears instantly instead of waiting for the server round-trip
    const tempMessage = {
      id: "temp_" + Date.now(),
      threadId: threadId,
      senderId: currentBrgyId,
      senderName: currentBrgyName,
      senderRole: "Barangay Midwife",
      recipientId: assignedRhu.id,
      message: textPayload,
      timestamp: new Date(),
      isOptimistic: true,
    };

    const previousList = messages;
    const updatedList = [...messages, tempMessage];
    setMessages(updatedList);
    messagesCacheRef.current[threadId] = updatedList;
    scrollToBottom();

    try {
      await addDoc(collection(db, "messages"), {
        threadId: threadId,
        senderId: currentBrgyId,
        senderName: currentBrgyName,
        senderRole: "Barangay Midwife",
        recipientId: assignedRhu.id,
        message: textPayload,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error sending message from midwife (Firestore write failed): ", err);
      // Roll back the optimistic bubble — it never actually reached Firestore.
      setMessages(previousList);
      messagesCacheRef.current[threadId] = previousList;
      setNewMessage(textPayload);
    }
  }

  return (
    <div className="midwife-layout">
      <aside className="midwife-sidebar">
        <div className="midwife-brand">
          <div className="midwife-brand-icon">
            <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
              <path d="M19 3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
            </svg>
          </div>
          <div>
            <p className="midwife-brand-name">CentralCare</p>
            <p className="midwife-brand-role">BRGY. {currentBrgyName.toUpperCase()} PANEL</p>
          </div>
        </div>

        <nav className="midwife-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "midwife-nav-item" + (isActive ? " active" : "")}>
              <span>{item.label}</span>
              {item.label === "Notifications" && Boolean(unreadCount) && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="midwife-sidebar-footer">
          <NavLink to="/midwife/settings" className={({ isActive }) => "midwife-nav-item midwife-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="midwife-main">
        <header className="midwife-topbar">
          <div className="midwife-topbar-right" style={{ marginLeft: "auto" }}>
            <div className="midwife-user">
              <div className="midwife-user-info">
                <span className="midwife-user-name">Midwife ({currentBrgyName})</span>
                <span className="midwife-user-role">Barangay Health Station</span>
              </div>
              <div className="midwife-avatar">
                {currentBrgyName.substring(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="midwife-content">
          <div className="rhu-page-header" style={{ marginBottom: "16px" }}>
            <div>
              <h1 className="rhu-page-title">Station Communication</h1>
              <p className="rhu-page-sub">Direct secure messaging with your parent health unit ({cleanName(assignedRhu.name)}).</p>
            </div>
          </div>

          <div className="messenger-container" style={{ gridTemplateColumns: "1fr" }}>
            <div className="messenger-chat-pane" style={{ borderLeft: "none" }}>
              <div className="messenger-chat-header">
                <div className="active-chat-title">{cleanName(assignedRhu.name)}</div>
                <div className="active-chat-sub">Parent Health Unit</div>
              </div>

              <div className="rhu-chat-messages-box">
                {messages.length === 0 ? (
                  <p className="rhu-chat-empty">No conversation history with {cleanName(assignedRhu.name)} yet. Send your report or message below!</p>
                ) : (
                  messages.map(msg => {
                    const isMe = msg.senderRole === "Barangay Midwife";
                    return (
                      <div key={msg.id} className={`rhu-chat-bubble ${isMe ? "outgoing" : "incoming"}`}>
                        <div className="rhu-chat-meta">
                          <span className="rhu-chat-sender">{cleanName(msg.senderName)}</span>
                          {msg.timestamp && <span className="rhu-chat-time">{formatTime(msg.timestamp)}</span>}
                        </div>
                        <p className="rhu-chat-text">{msg.message}</p>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSend} className="rhu-chat-input-row">
                <input
                  type="text"
                  className="rhu-input"
                  placeholder={`Message ${cleanName(assignedRhu.name)}...`}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                />
                <button type="submit" className="rhu-btn-primary" style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>Send</button>
              </form>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}