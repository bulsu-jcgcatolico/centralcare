import { useState, useEffect, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, query, where, orderBy, limit, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./CHOMessages.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Population Report", to: "/cho/population-report"  },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Messages",          to: "/cho/messages"           },
  { label: "Notifications",     to: "/cho/notifications"      },
];

const readKey = (threadId) => `centralcare_lastRead_${threadId}`;

function formatTime(ts) {
  if (!ts) return "";
  const date = typeof ts.toDate === "function" ? ts.toDate() : new Date(ts);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

// Some older messages have a barangay accidentally baked into senderName
// (e.g. "RHU 1 - Longos"), from before display names were cleaned at send time.
// Strip anything after a dash so even historical messages render clean.
function cleanSenderName(name) {
  if (!name) return "";
  return String(name).split(/[-–—]/)[0].trim();
}

export default function CHOMessages() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const choId = "cho_admin";
  const choName = user?.displayName || user?.name || "Dr. Sarah Smith";

  // Fixed list from RHU 1 to RHU 10 only
  const contacts = Array.from({ length: 10 }, (_, i) => ({
    id: `rhu_${i + 1}`,
    name: `RHU ${i + 1}`,
    role: "Rural Health Unit",
    type: "rhu"
  }));

  const [selectedContact, setSelectedContact] = useState(contacts[0]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  // threadsMeta: { [contactId]: { lastMessage, lastSenderRole, lastTimestamp, unread } }
  const [threadsMeta, setThreadsMeta] = useState({});
  const messagesEndRef = useRef(null);
  const messagesCacheRef = useRef({}); // threadId -> messages array, so switching contacts is instant

  function handleLogout() { logout(); navigate("/"); }

  const threadId = selectedContact ? `cho_${selectedContact.id}` : "";

  // Live "last message" preview + unread badge for every RHU, regardless of which chat is open.
  useEffect(() => {
    const unsubscribers = contacts.map((contact) => {
      const tId = `cho_${contact.id}`;
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
        const fromThem = data.senderRole !== "CHO Administrator";
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
        console.error("CHO thread preview listener error:", error);
      });
    });

    return () => unsubscribers.forEach((unsub) => unsub());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedContact?.id]);

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
      console.error("CHO message listener error:", error);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threadId]);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  function handleSelectContact(contact) {
    setSelectedContact(contact);
    localStorage.setItem(readKey(`cho_${contact.id}`), String(Date.now()));
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
      senderId: user?.uid || choId,
      senderName: choName,
      senderRole: "CHO Administrator",
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
        senderId: user?.uid || choId,
        senderName: choName,
        senderRole: "CHO Administrator",
        recipientId: selectedContact.id,
        message: textPayload,
        timestamp: serverTimestamp(),
      });
    } catch (err) {
      console.error("Error sending CHO message (Firestore write failed): ", err);
      // Roll back the optimistic bubble — it never actually reached Firestore,
      // so leaving it on screen would make a failed send look like a successful one.
      setMessages(previousList);
      messagesCacheRef.current[threadId] = previousList;
      setNewMessage(textPayload); // restore text input so the user can retry
    }
  }

  return (
    <div className="cho-layout">
      <aside className="cho-sidebar">
        <div className="cho-brand">
          <div className="cho-brand-icon">
            <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
              <path d="M19 3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
            </svg>
          </div>
          <div>
            <p className="cho-brand-name">CentralCare</p>
            <p className="cho-brand-role">CHO ADMIN PANEL</p>
          </div>
        </div>
        <nav className="cho-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "cho-nav-item" + (isActive ? " active" : "")}>
              <span>{item.label}</span>
              {item.label === "Notifications" && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="cho-sidebar-footer">
          <button className="cho-nav-item cho-nav-btn">Settings</button>
          <button className="cho-nav-item cho-nav-btn cho-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="cho-main">
        <header className="cho-topbar">
          <div className="cho-topbar-right" style={{ marginLeft: "auto" }}>
            <div className="cho-user">
              <div className="cho-user-info">
                <span className="cho-user-name">Dr. Sarah Smith</span>
                <span className="cho-user-role">CHO Administrator</span>
              </div>
              <div className="cho-avatar">SS</div>
            </div>
          </div>
        </header>

        <main className="cho-content">
          <div className="cho-page-header" style={{ marginBottom: "12px" }}>
            <div>
              <h1 className="cho-page-title">CHO Direct Messaging</h1>
              <p className="cho-page-sub">Coordinate directly with all Rural Health Units (RHU 1 to RHU 10).</p>
            </div>
          </div>

          <div className="messenger-container-forced">
            <div className="messenger-sidebar-forced">
              <div className="messenger-sidebar-title">Health Units (RHU 1 - 10)</div>
              <div className="rhu-list-scroll">
                {contacts.map((contact) => {
                  const meta = threadsMeta[contact.id];
                  return (
                    <div
                      key={contact.id}
                      className={`rhu-item ${selectedContact?.id === contact.id ? "active" : ""}`}
                      onClick={() => handleSelectContact(contact)}
                    >
                      <div className="rhu-avatar-placeholder">
                        {contact.name.replace(/[^0-9]/g, "")}
                      </div>
                      <div className="rhu-info">
                        <div className="rhu-info-top">
                          <span className="rhu-name">{contact.name}</span>
                          {meta?.lastTimestamp && (
                            <span className="rhu-preview-time">{formatTime(meta.lastTimestamp)}</span>
                          )}
                        </div>
                        <span className={`rhu-sub ${meta?.unread ? "unread-text" : ""}`}>
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

                  <div className="cho-chat-messages-box">
                    {messages.length === 0 ? (
                      <p className="cho-chat-empty">No conversation history with {selectedContact.name} yet. Send your message below!</p>
                    ) : (
                      messages.map(msg => {
                        const isMe = msg.senderId === user?.uid || msg.senderId === choId || msg.senderRole === "CHO Administrator";
                        return (
                          <div key={msg.id} className={`cho-chat-bubble ${isMe ? "outgoing" : "incoming"}`}>
                            <div className="cho-chat-meta">
                              <span className="cho-chat-sender">{cleanSenderName(msg.senderName)}</span>
                              {msg.timestamp && <span className="cho-chat-time">{formatTime(msg.timestamp)}</span>}
                            </div>
                            <p className="cho-chat-text">{msg.message}</p>
                          </div>
                        );
                      })
                    )}
                    <div ref={messagesEndRef} />
                  </div>

                  <form onSubmit={handleSend} className="cho-chat-input-row">
                    <input
                      type="text"
                      className="cho-input"
                      placeholder={`Message ${selectedContact.name}...`}
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                    <button type="submit" className="cho-btn-primary">Send</button>
                  </form>
                </>
              ) : (
                <div className="cho-chat-empty" style={{ margin: "auto" }}>Select an RHU contact to start chatting</div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}