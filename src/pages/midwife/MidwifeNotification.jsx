import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Notifications", to: "/midwife/notifications" },
];

export default function MidwifeNotification() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadNotifications(); }, []);

  async function loadNotifications() {
    setLoading(true);
    try {
      const q = query(
        collection(db, "notifications"),
        where("toBarangayName", "==", userData?.barangayName ?? "")
      );
      const snap = await getDocs(q);
      setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function markAllRead() {
    try {
      for (const n of notifications.filter(n => !n.read)) {
        await updateDoc(doc(db, "notifications", n.id), { read: true });
      }
      setNotifications(notifications.map(n => ({ ...n, read: true })));
    } catch (err) { alert("Error: " + err.message); }
  }

  async function dismissNotif(id) {
    try {
      await deleteDoc(doc(db, "notifications", id));
      setNotifications(notifications.filter(n => n.id !== id));
    } catch (err) { alert("Error: " + err.message); }
  }

  const filtered = filter === "all"
    ? notifications
    : notifications.filter(n => n.type === filter);
  const unreadNum = notifications.filter(n => !n.read).length;

  const borderColor = (n) => {
    if (n.type === "low-stock") return n.level === "Critical" ? "#dc2626" : "#d97706";
    return "#1a56db";
  };

  const bgColor = (n) => {
    if (n.read) return "#f9fafb";
    if (n.type === "low-stock") return n.level === "Critical" ? "#fef2f2" : "#fffbeb";
    return "#eff6ff";
  };

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
            <p className="midwife-brand-role">HEALTH SYSTEM</p>
          </div>
        </div>
        <nav className="midwife-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "midwife-nav-item" + (isActive ? " active" : "")}>
              <span>{item.label}</span>
              {item.label === "Notifications" && unreadCount && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="midwife-sidebar-footer">
          <button className="midwife-nav-item midwife-nav-btn">Settings</button>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="midwife-main">
        <header className="midwife-topbar">
          <input className="midwife-search" type="text" placeholder="Search notifications..." />
          <div className="midwife-topbar-right">
            <div className="midwife-user">
              <div className="midwife-user-info">
                <span className="midwife-user-name">{userData?.username || "Maria Santos"}</span>
                <span className="midwife-user-role">Registered Midwife</span>
              </div>
              <div className="midwife-avatar">MS</div>
            </div>
          </div>
        </header>

        <main className="midwife-content">
          <div className="midwife-page-header">
            <div>
              <h1 className="midwife-page-title">Notifications</h1>
              <p className="midwife-page-sub">
                {unreadNum > 0 ? `${unreadNum} unread notification(s)` : "All caught up!"}
              </p>
            </div>
            <button className="midwife-btn-primary" onClick={markAllRead}>
              Mark All as Read
            </button>
          </div>

          {/* Stats */}
          <div className="midwife-stats-grid midwife-stats-grid--3">
            <div className="midwife-stat-card-simple">
              <div className="midwife-stat-icon-sm">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
              </div>
              <div>
                <p className="midwife-stat-label-sm">TOTAL</p>
                <p className="midwife-stat-value-sm">{notifications.length}</p>
              </div>
            </div>
            <div className="midwife-stat-card-simple midwife-stat--warning">
              <div className="midwife-stat-icon-sm">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-stat-label-sm">UNREAD</p>
                <p className="midwife-stat-value-sm">{unreadNum}</p>
              </div>
            </div>
            <div className="midwife-stat-card-simple">
              <div className="midwife-stat-icon-sm">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-stat-label-sm">FROM RHU</p>
                <p className="midwife-stat-value-sm">
                  {notifications.filter(n => n.type === "distribution").length}
                </p>
              </div>
            </div>
          </div>

          {/* Filter chips */}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "1rem" }}>
            {[
              { key: "all",          label: "All"          },
              { key: "distribution", label: "From RHU"     },
              { key: "low-stock",    label: "Low Stock"    },
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
            <div className="midwife-empty-small"><p>Loading...</p></div>
          ) : filtered.length === 0 ? (
            <div className="midwife-empty-state">
              <div className="midwife-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
              </div>
              <h2 className="midwife-empty-title">No Notifications</h2>
              <p className="midwife-empty-text">
                Notifications from RHU and low stock alerts will appear here.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {filtered.map(n => (
                <div key={n.id} style={{
                  background: bgColor(n),
                  border: `1px solid ${n.read ? "#e5e7eb" : "#bfdbfe"}`,
                  borderLeft: `4px solid ${borderColor(n)}`,
                  borderRadius: "10px", padding: "14px 16px",
                  display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: "1rem"
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <p style={{ fontWeight: "600", color: "#0f172a", margin: 0 }}>{n.title}</p>
                      {!n.read && (
                        <span style={{
                          background: n.type === "low-stock"
                            ? (n.level === "Critical" ? "#dc2626" : "#d97706")
                            : "#1a56db",
                          color: "#fff", fontSize: "10px", fontWeight: "700",
                          padding: "2px 8px", borderRadius: "99px"
                        }}>
                          {n.level || "NEW"}
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: "13px", color: "#6b7280", margin: 0 }}>{n.message}</p>
                  </div>
                  <button onClick={() => dismissNotif(n.id)}
                    style={{ background: "none", border: "none", color: "#9ca3af",
                      cursor: "pointer", fontSize: "18px", flexShrink: 0 }}>x</button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}