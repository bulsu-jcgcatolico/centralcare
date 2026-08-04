import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Population Report", to: "/cho/population-report"  },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Notifications",     to: "/cho/notifications"      },
];

export default function CHONotification() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadNotifications(); }, []);

  async function loadNotifications() {
    setLoading(true);
    try {
      // CHO only sees low-stock alerts
      const q = query(
        collection(db, "notifications"),
        where("type", "==", "low-stock"),
        where("fromType", "==", "cho")
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

  const unreadNum = notifications.filter(n => !n.read).length;

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
              {item.label === "Notifications" && unreadCount && (
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
          <input className="cho-search" type="text" placeholder="Search notifications..." />
          <div className="cho-topbar-right">
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
          <div className="cho-page-header">
            <div>
              <h1 className="cho-page-title">Notifications</h1>
              <p className="cho-page-sub">
                {unreadNum > 0 ? `${unreadNum} unread notification(s)` : "All caught up!"}
              </p>
            </div>
            <button className="cho-btn-secondary" onClick={markAllRead}>Mark All as Read</button>
          </div>

          {/* Stats */}
          <div className="cho-stats-grid cho-stats-grid--3">
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{notifications.length}</span></div>
            </div>
            <div className="cho-stat-card cho-stat--orange">
              <p className="cho-stat-label">UNREAD</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{unreadNum}</span></div>
            </div>
            <div className="cho-stat-card cho-stat--red">
              <p className="cho-stat-label">LOW STOCK ALERTS</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">
                  {notifications.filter(n => n.level === "Critical").length}
                </span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="cho-empty-small"><p>Loading...</p></div>
          ) : notifications.length === 0 ? (
            <div className="cho-empty-state">
              <div className="cho-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                </svg>
              </div>
              <h2 className="cho-empty-title">No Low Stock Alerts</h2>
              <p className="cho-empty-text">
                You will be notified here when any CHO inventory item drops to low or critical levels.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              {notifications.map(n => (
                <div key={n.id} style={{
                  background: n.read ? "#f9fafb" : (n.level === "Critical" ? "#fef2f2" : "#fffbeb"),
                  border: `1px solid ${n.read ? "#e5e7eb" : n.level === "Critical" ? "#fecaca" : "#fde68a"}`,
                  borderLeft: `4px solid ${n.level === "Critical" ? "#dc2626" : "#d97706"}`,
                  borderRadius: "10px", padding: "14px 16px",
                  display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: "1rem"
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                      <p style={{ fontWeight: "600", color: "#0f172a", margin: 0 }}>{n.title}</p>
                      {!n.read && (
                        <span style={{ background: n.level === "Critical" ? "#dc2626" : "#d97706",
                          color: "#fff", fontSize: "10px", fontWeight: "700",
                          padding: "2px 8px", borderRadius: "99px" }}>
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