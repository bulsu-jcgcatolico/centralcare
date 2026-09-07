import { useState, useEffect, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, addDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp, getDocs, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./RHUMessages.css";

const navItems = [
  { label: "Dashboard",       to: "/rhu/dashboard"         },
  { label: "Inventory",       to: "/rhu/inventory"         },
  { label: "Barangay",        to: "/rhu/barangay"          },
  { label: "Distribution",    to: "/rhu/distribution"      },
  { label: "Balance Reports", to: "/rhu/balance-reports"   },
  { label: "Reports",         to: "/rhu/reports"           },
  { label: "Messages",        to: "/rhu/messages"          },
  { label: "Notifications",   to: "/rhu/notifications"     },
];

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";
const BARANGAYS_COLLECTION = "cho_barangays";

const readKey = (threadId) => `centralcare_lastRead_${threadId}`;

function formatTime(ts) {
  if (!ts) return "";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Some older messages have a barangay accidentally baked into senderName
// (e.g. "RHU 1 - Longos"). Strip anything after a dash so historical messages render clean.
function cleanSenderName(name) {
  if (!name) return "";
  return String(name).split(/[-–—]/)[0].trim();
}

export default function RHUMessages() {
  const { logout, userData, user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const activeUser = userData || user;
  
  // Safely parse rhuId and rhuName
  const rawRhuId = activeUser?.rhuId ?? "1";
  const numericMatch = String(rawRhuId).match(/\d+/);
  const rhuNumber = numericMatch ? numericMatch[0] : "1";
  
  const currentRhuId = `rhu_${rhuNumber}`;
  const rawRhuName = activeUser?.rhuName || `RHU ${rhuNumber}`;
  // Some RHU profiles have a barangay accidentally appended (e.g. "RHU 1 - Longos").
  // Strip anything after a dash so the RHU's own name always displays clean.
  const currentRhuName = String(rawRhuName).split(/[-–—]/)[0].trim() || `RHU ${rhuNumber}`;

  const [contacts, setContacts] = useState([]);
  const [selectedContact, setSelectedContact] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  // threadsMeta: { [contactId]: { lastMessage, lastSenderRole, lastTimestamp, unread } }
  const [threadsMeta, setThreadsMeta] = useState({});
  const messagesEndRef = useRef(null);
  const messagesCacheRef = useRef({}); // threadId -> messages array, so switching contacts is instant

  function handleLogout() { logout(); navigate("/"); }

  function threadIdFor(contact) {
    if (!contact) return "";
    return contact.id === "cho_admin" ? `cho_${currentRhuId}` : `${currentRhuId}_${contact.id}`;
  }

  // Load CHO Central Office + Assigned Barangays dynamically from cho_rhu_registry & cho_barangays
  useEffect(() => {
    async function loadAssignedBarangays() {
      const contactList = [
        { id: "cho_admin", name: "CHO Central Office", role: "CHO Admin", type: "cho" }
      ];

      try {
        let assignedKeys = [];

        // Strategy 1: Look up registry document directly by ID (e.g., "9")
        if (rhuNumber) {
          const regRef = doc(db, RHU_REGISTRY_COLLECTION, String(rhuNumber));
          const regSnap = await getDoc(regRef);
          if (regSnap.exists()) {
            assignedKeys = regSnap.data().assignedBarangays || [];
          }
        }

        // Strategy 2: Scan registry collection if array is empty
        if (assignedKeys.length === 0) {
          const regSnap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
          regSnap.docs.forEach(d => {
            const data = d.data();
            const dRhuId = String(data.rhuId || "").trim().toLowerCase();
            const dRhuName = String(data.rhuName || d.id || "").trim().toLowerCase();
            if (dRhuId === String(rhuNumber) || dRhuName === currentRhuName.toLowerCase()) {
              if (Array.isArray(data.assignedBarangays)) {
                assignedKeys = data.assignedBarangays;
              }
            }
          });
        }

        // Fetch master barangays collection to map details properly
        const allSnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
        const allBarangays = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const normalizedKeys = assignedKeys.map(k => String(k).trim().toLowerCase());

        // Filter master barangays matching the registry assignment for this specific RHU
        const assigned = allBarangays.filter(b => {
          const bName = String(b.barangayName || b.name || "").trim().toLowerCase();
          const bId = String(b.id).trim().toLowerCase();
          const bRhuId = String(b.rhuId || b.assignedRhuId || "").trim().toLowerCase();
          const bRhuName = String(b.assignedRhu || b.rhuName || "").trim().toLowerCase();

          const inRegistry = normalizedKeys.includes(bName) || normalizedKeys.includes(bId);
          const directMatch = (rhuNumber && bRhuId === String(rhuNumber)) || (currentRhuName && bRhuName === currentRhuName.toLowerCase());

          return inRegistry || directMatch;
        }).sort((a, b) => (a.barangayName || a.name || "").localeCompare(b.barangayName || b.name || ""));

        // Append validated barangays to contact list.
        // Use the barangay's real Firestore doc ID (not a position-based index) so that
        // MidwifeMessages.jsx can independently compute the exact same contact/thread ID
        // without needing to replicate this filter+sort order.
        assigned.forEach((b) => {
          const brgyName = b.barangayName || b.name || b.id;
          contactList.push({
            id: `brgy_${b.id}`,
            name: brgyName,
            role: "Barangay Health Station",
            type: "barangay"
          });
        });
      } catch (err) {
        console.error("Error loading assigned barangays for messages:", err);
      }

      setContacts(contactList);
      if (contactList.length > 0) {
        setSelectedContact(contactList[0]);
      }
    }

    loadAssignedBarangays();
  }, [rhuNumber, currentRhuName]);

  const threadId = threadIdFor(selectedContact);

  // Live "last message" preview + unread badge for every contact
  useEffect(() => {
    if (contacts.length === 0) return;

    const unsubscribers = contacts.map((contact) => {
      const tId = threadIdFor(contact);
      const q = query(
        collection(db, "messages"),
        where("threadId", "==", tId),
        orderBy("timestamp", "desc"),
        limit(1)
      );
      return onSnapshot(q, (snapshot) => {
        if (snapshot.empty) return;
        const docSnap = snapshot.docs[0];
        const data = docSnap.data({ serverTimestamps: "estimate" });
        const lastRead = Number(localStorage.getItem(readKey(tId)) || 0);
        const msgTime = data.timestamp?.toDate ? data.timestamp.toDate().getTime() : Date.now();
        const fromThem = data.senderRole !== "RHU Staff";
        const isOpenRightNow = selectedContact?.id === contact.id;

        setThreadsMeta((prev) => ({
          ...prev,
          [contact.id]: {
            lastMessage: data.message,
            lastSenderRole: data.senderRole,
            lastTimestamp: data.timestamp,
            unread: fromThem && msgTime > lastRead && !isOpenRightNow,
          },
        }));
      }, (error) => {
        console.error("RHU thread preview listener error:", error);
      });
    });

    return () => unsubscribers.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, selectedContact?.id]);

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
        ...docSnap.data({ serverTimestamps: "estimate" }),
      }));
      messagesCacheRef.current[threadId] = list;
      setMessages(list);
      scrollToBottom();

      localStorage.setItem(readKey(threadId), String(Date.now()));
      if (selectedContact) {
        setThreadsMeta((prev) => ({
          ...prev,
          [selectedContact.id]: { ...(prev[selectedContact.id] || {}), unread: false },
        }));
      }
    }, (error) => {
      console.error("RHU message listener error:", error);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSelectContact(contact) {
    setSelectedContact(contact);
    localStorage.setItem(readKey(threadIdFor(contact)), String(Date.now()));
    setThreadsMeta((prev) => ({
      ...prev,
      [contact.id]: { ...(prev[contact.id] || {}), unread: false },
    }));
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedContact || !threadId) return;

    const textPayload = newMessage.trim();
    setNewMessage("");

    // OPTIMISTIC UPDATE: Appears instantly without waiting for server round-trip
    const tempMessage = {
      id: "temp_" + Date.now(),
      threadId: threadId,
      senderId: activeUser?.uid || currentRhuId,
      senderName: currentRhuName,
      senderRole: "RHU Staff",
      recipientId: selectedContact.id,
      message: textPayload,
      timestamp: new Date(),
      isOptimistic: true
    };

    const previousList = messages;
    const updatedList = [...messages, tempMessage];
    setMessages(updatedList);
    messagesCacheRef.current[threadId] = updatedList;
    scrollToBottom();

    try {
      await addDoc(collection(db, "messages"), {
        threadId: threadId,
        senderId: activeUser?.uid || currentRhuId,
        senderName: currentRhuName,
        senderRole: "RHU Staff",
        recipientId: selectedContact.id,
        message: textPayload,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error sending message (Firestore write failed): ", err);
      // Roll back the optimistic bubble — it never actually reached Firestore.
      setMessages(previousList);
      messagesCacheRef.current[threadId] = previousList;
      setNewMessage(textPayload); // restore input so the user can retry
    }
  }

  return (
    <div className="rhu-layout">
      <aside className="rhu-sidebar">
        <div className="rhu-brand">
          <div className="rhu-brand-icon">
            <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
              <path d="M19 3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
            </svg>
          </div>
          <div>
            <p className="rhu-brand-name">CentralCare</p>
            <p className="rhu-brand-role">{currentRhuName.toUpperCase()} PANEL</p>
          </div>
        </div>
        <nav className="rhu-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "rhu-nav-item" + (isActive ? " active" : "")}>
              <span>{item.label}</span>
              {item.label === "Notifications" && Boolean(unreadCount) && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="rhu-sidebar-footer">
          <NavLink to="/rhu/settings" className={({ isActive }) => "rhu-nav-item rhu-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="rhu-main">
        <header className="rhu-topbar">
          <div className="rhu-topbar-right" style={{ marginLeft: "auto" }}>
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">RHU {rhuNumber} Admin</span>
              </div>
              <div className="rhu-avatar">RH</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header" style={{ marginBottom: "12px" }}>
            <div>
              <h1 className="rhu-page-title">RHU Messages & Coordination</h1>
              <p className="rhu-page-sub">Communicate with the Central Health Office (CHO) or your assigned Barangay Health Stations.</p>
            </div>
          </div>

          <div className="messenger-container-forced">
            <div className="messenger-sidebar-forced">
              <div className="messenger-sidebar-title">Contacts & Stations</div>
              <div className="contact-list-scroll">
                {contacts.map((contact) => {
                  const meta = threadsMeta[contact.id];
                  return (
                    <div
                      key={contact.id}
                      className={`contact-item ${selectedContact?.id === contact.id ? "active" : ""}`}
                      onClick={() => handleSelectContact(contact)}
                    >
                      <div className={`contact-avatar-placeholder ${contact.type}`}>
                        {contact.type === "cho" ? "CHO" : "Brgy"}
                      </div>
                      <div className="contact-info">
                        <div className="contact-info-top">
                          <span className="contact-name">{contact.name}</span>
                          {meta?.lastTimestamp && (
                            <span className="contact-preview-time">{formatTime(meta.lastTimestamp)}</span>
                          )}
                        </div>
                        <span className={`contact-sub ${meta?.unread ? "unread-text" : ""}`}>
                          {meta?.lastMessage ? meta.lastMessage : contact.role}
                        </span>
                      </div>
                      {meta?.unread && <span className="unread-dot" />}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="messenger-chat-pane-forced">
              {selectedContact ? (
                <>
                  <div className="messenger-chat-header">
                    <div className="active-chat-title">{selectedContact.name}</div>
                    <div className="active-chat-sub">{selectedContact.role}</div>
                  </div>

                  <div className="rhu-chat-messages-box">
                    {messages.length === 0 ? (
                      <p className="rhu-chat-empty">No messages with {selectedContact.name} yet. Send a message below!</p>
                    ) : (
                      messages.map(msg => {
                        const isMe = msg.senderId === activeUser?.uid || msg.senderId === currentRhuId || msg.senderRole === "RHU Staff";
                        return (
                          <div key={msg.id} className={`rhu-chat-bubble ${isMe ? "outgoing" : "incoming"}`}>
                            <div className="rhu-chat-meta">
                              <span className="rhu-chat-sender">{cleanSenderName(msg.senderName)}</span>
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
                      placeholder={`Message ${selectedContact.name}...`}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                    <button type="submit" className="rhu-btn-primary">Send</button>
                  </form>
                </>
              ) : (
                <div className="rhu-chat-empty" style={{ margin: "auto" }}>Select a contact to start chatting</div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}