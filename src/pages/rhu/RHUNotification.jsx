import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";

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

export default function RHUNotification() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [justReadIds, setJustReadIds] = useState(new Set());

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadNotifications(); }, []);

  async function loadNotifications() {
    setLoading(true);
    try {
      // CHOBatchDistribution.jsx writes toRhuId using the RHU registry's raw doc ID
      // (a plain number, e.g. "9"), not userData.rhuId verbatim — those can differ in
      // format (e.g. "RHU 9" vs "9"). Extract just the number so both sides always agree.
      const rhuNumber = String(userData?.rhuId ?? "").match(/\d+/)?.[0] ?? "";
      const q = query(
        collection(db, "notifications"),
        where("toRhuId", "==", rhuNumber)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setNotifications(list);

      // Opening this page is itself the "read" action, same as Facebook/YouTube
      // notification panels — the sidebar badge clears as soon as you look.
      const unread = list.filter(n => !n.read);
      if (unread.length > 0) {
        setJustReadIds(new Set(unread.map(n => n.id)));
        await Promise.all(unread.map(n => updateDoc(doc(db, "notifications", n.id), { read: true })));
      }
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function markAllRead() {
    try {
      for (const n of notifications.filter(n => !n.read)) {
        await updateDoc(doc(db, "notifications", n.id), { read: true });
      }
      setNotifications(notifications.map(n => ({ ...n, read: true })));
      setJustReadIds(new Set());
    } catch (err) { alert("Error: " + err.message); }
  }

  async function dismissNotif(id) {
    try {
      await deleteDoc(doc(db, "notifications", id));
      setNotifications(notifications.filter(n => n.id !== id));
    } catch (err) { alert("Error: " + err.message); }
  }

  const filtered = (filter === "all" ? notifications
    : notifications.filter(n => n.type === filter)
  ).filter(n =>
    (n.title || "").toLowerCase().includes(search.trim().toLowerCase()) ||
    (n.message || "").toLowerCase().includes(search.trim().toLowerCase())
  );
  const unreadNum = justReadIds.size;

  const borderColor = (n) => {
    if (n.type === "low-stock") return n.level === "Critical" ? "#dc2626" : "#d97706";
    return "#1a56db";
  };

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
            <p className="rhu-brand-role">RHU UNIT PANEL</p>
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
          <input className="rhu-search" type="text" placeholder="Search notifications..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="rhu-topbar-right">
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">{userData?.username || "RHU Admin"}</span>
              </div>
              <div className="rhu-avatar">RH</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header">
            <div>
              <h1 className="rhu-page-title">Notifications</h1>
              <p className="rhu-page-sub">
                {unreadNum > 0 ? `${unreadNum} unread notification(s)` : "All caught up!"}
              </p>
            </div>
            <button className="rhu-btn-secondary" onClick={markAllRead}>Mark All as Read</button>
          </div>

          {/* Stats */}
          <div className="rhu-stats-grid rhu-stats-grid--3">
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{notifications.length}</span></div>
            </div>
            <div className="rhu-stat-card rhu-stat--orange">
              <p className="rhu-stat-label">UNREAD</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{unreadNum}</span></div>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">FROM CHO</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">
                  {notifications.filter(n => n.type === "distribution").length}
                </span>
              </div>
            </div>
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "1rem" }}>
            {[
              { key: "all", label: "All" },
              { key: "distribution", label: "From CHO" },
              { key: "low-stock", label: "Low Stock" },
            ].map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)} style={{
                padding: "8px 16px", borderRadius: "8px", border: "1px solid",
                fontSize: "13px", fontWeight: "500", cursor: "pointer",
                background: filter === f.key ? "#eff6ff" : "#f3f4f6",
                borderColor: filter === f.key ? "#bfdbfe" : "#e5e7eb",
                color: filter === f.key ? "#1a56db" : "#374151"
              }}>{f.label}</button>
            ))}
          </div>

          {loading ? (
            <div className="rhu-empty-small"><p>Loading...</p></div>
          ) : filtered.length === 0 ? (
            <div className="rhu-empty-state">
              <div className="rhu-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
              </div>
              <h2 className="rhu-empty-title">No Notifications</h2>
              <p className="rhu-empty-text">
                Notifications from CHO will appear here when supplies are distributed to your RHU.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filtered.map(n => {
                const wasUnread = justReadIds.has(n.id);
                return (
                <div key={n.id} style={{
                  background: !wasUnread ? "#f9fafb" : "#eff6ff",
                  border: `1px solid ${!wasUnread ? "#e5e7eb" : "#bfdbfe"}`,
                  borderLeft: `4px solid ${borderColor(n)}`,
                  borderRadius: "10px", padding: "14px 16px",
                  display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: "1rem"
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <p style={{ fontWeight: "600", color: "#0f172a", margin: 0 }}>{n.title}</p>
                      {wasUnread && (
                        <span style={{ background: "#1a56db", color: "#fff", fontSize: "10px",
                          fontWeight: "700", padding: "2px 8px", borderRadius: "99px" }}>NEW</span>
                      )}
                    </div>
                    <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>{n.message}</p>
                  </div>
                  <button onClick={() => dismissNotif(n.id)}
                    style={{ background: "none", border: "none", color: "#9ca3af",
                      cursor: "pointer", fontSize: "18px", flexShrink: 0 }}>x</button>
                </div>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}