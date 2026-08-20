import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where, updateDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./MidwifeNotification.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
];

export default function MidwifeNotification() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [notifications, setNotifications] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

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

  const filtered = notifications
    .filter(n => (filter === "all" ? true : n.type === filter))
    .filter(n =>
      search.trim() === ""
        ? true
        : n.title?.toLowerCase().includes(search.toLowerCase()) ||
          n.message?.toLowerCase().includes(search.toLowerCase())
    );

  const unreadNum = notifications.filter(n => !n.read).length;

  const borderColor = (n) => {
    if (n.type === "low-stock") return n.level === "Critical" ? "#dc2626" : "#d97706";
    return "#1a56db";
  };

  const cardBg = (n) => {
    if (n.read) return "#f9fafb";
    if (n.type === "low-stock") return n.level === "Critical" ? "#fef2f2" : "#fffbeb";
    return "#eff6ff";
  };

  const cardBorder = (n) => {
    if (n.read) return "#e5e7eb";
    if (n.type === "low-stock") return n.level === "Critical" ? "#fecaca" : "#fde68a";
    return "#bfdbfe";
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
              {item.label === "Notifications" && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="midwife-sidebar-footer">
          <button className="midwife-nav-item midwife-nav-btn">Settings</button>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="midwife-main">
        <header className="midwife-topbar">
          <input
            className="midwife-search"
            type="text"
            placeholder="Search notifications..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
            <div className="midwife-header-actions">
              <button className="midwife-btn-secondary" onClick={markAllRead}>Mark All as Read</button>
            </div>
          </div>

          {/* Stat Cards Header */}
          <div className="midwife-stats-grid midwife-stats-grid--3">
            <div className="midwife-stat-card">
              <p className="midwife-stat-label">TOTAL</p>
              <div className="midwife-stat-row">
                <span className="midwife-stat-value">{notifications.length}</span>
              </div>
            </div>
            <div className="midwife-stat-card midwife-stat--orange">
              <p className="midwife-stat-label">UNREAD</p>
              <div className="midwife-stat-row">
                <span className="midwife-stat-value">{unreadNum}</span>
              </div>
            </div>
            <div className="midwife-stat-card">
              <p className="midwife-stat-label">FROM RHU</p>
              <div className="midwife-stat-row">
                <span className="midwife-stat-value">
                  {notifications.filter(n => n.type === "distribution").length}
                </span>
              </div>
            </div>
          </div>

          {/* Filter Chips */}
          <div className="midwife-filter-chips">
            {[
              { key: "all",          label: "All"       },
              { key: "distribution", label: "From RHU"  },
              { key: "low-stock",    label: "Low Stock" },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`midwife-chip ${filter === f.key ? "active" : ""}`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* List Display */}
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
            <div className="midwife-notif-container">
              {filtered.map(n => (
                <div
                  key={n.id}
                  className="midwife-notif-card"
                  style={{
                    background: cardBg(n),
                    borderColor: cardBorder(n),
                    borderLeftColor: borderColor(n)
                  }}
                >
                  <div className="midwife-notif-body">
                    <div className="midwife-notif-title-row">
                      <p className="midwife-notif-title">{n.title}</p>
                      {!n.read && (
                        <span
                          className="midwife-notif-badge"
                          style={{
                            background: n.type === "low-stock"
                              ? (n.level === "Critical" ? "#dc2626" : "#d97706")
                              : "#1a56db"
                          }}
                        >
                          {n.level || "NEW"}
                        </span>
                      )}
                    </div>
                    <p className="midwife-notif-message">{n.message}</p>
                  </div>
                  <button
                    className="midwife-notif-close-btn"
                    onClick={() => dismissNotif(n.id)}
                    title="Dismiss notification"
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}