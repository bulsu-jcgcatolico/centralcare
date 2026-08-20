import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import "./RHUDashboard.css";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"     },
  { label: "Inventory",     to: "/rhu/inventory"     },
  { label: "Barangay",      to: "/rhu/barangay"      },
  { label: "Distribution",  to: "/rhu/distribution"  },
  { label: "Reports",       to: "/rhu/reports"       },
  { label: "Messages",      to: "/rhu/messages"      },
  { label: "Notifications", to: "/rhu/notifications" },
];

const PIE_COLORS = ["#1a56db", "#93c5fd", "#dbeafe", "#bfdbfe", "#eff6ff"];

export default function RHUDashboard() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [search, setSearch] = useState("");
  const [inventory, setInventory] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, distSnap, notifSnap] = await Promise.all([
        getDocs(query(collection(db, "inventory"),
          where("ownerType", "==", "rhu"),
          where("rhuId", "==", userData?.rhuId ?? ""))),
        getDocs(query(collection(db, "rhu_distributions"),
          where("fromRhuId", "==", userData?.rhuId ?? ""))),
        getDocs(query(collection(db, "notifications"),
          where("toRhuId", "==", userData?.rhuId ?? "")))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDistributions(distSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setNotifications(notifSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const lowStockItems = inventory.filter(i => (i.remaining ?? i.quantity) <= 50);
  const expiringItems = inventory.filter(i => {
    if (!i.expiry) return false;
    const days = (new Date(i.expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= 30 && days >= 0;
  });

  // Bar chart — inventory by category
  const categoryMap = {};
  inventory.forEach(i => {
    const cat = i.category || "Other";
    categoryMap[cat] = (categoryMap[cat] || 0) + (i.remaining ?? i.quantity ?? 0);
  });
  const barData = Object.entries(categoryMap).map(([category, value]) => ({ category, value }));

  // Pie chart — distributions by barangay
  const barangayMap = {};
  distributions.forEach(d => {
    (d.barangayDistribution || []).forEach(b => {
      barangayMap[b.name] = (barangayMap[b.name] || 0) + (b.boxes || 0);
    });
  });
  const pieData = Object.entries(barangayMap).slice(0, 5).map(([name, value]) => ({ name, value }));
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const recentActivity = [
    ...inventory.map(i => ({
      id: i.id,
      title: `Added: ${i.name}`,
      sub: `${i.quantity} boxes`,
      time: i.date || "—",
      color: "#1a56db"
    })),
    ...distributions.map(d => ({
      id: d.id,
      title: `Distributed: ${d.medicineName}`,
      sub: `${d.totalBoxes} boxes to barangays`,
      time: d.date || "—",
      color: "#16a34a"
    }))
  ].slice(0, 5);

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
              {item.label === "Notifications" && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="rhu-sidebar-footer">
          <button className="rhu-nav-item rhu-nav-btn">Settings</button>
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="rhu-main">
        <header className="rhu-topbar">
          <input className="rhu-search" type="text"
            placeholder="Search patients, appointments, or medical records..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="rhu-topbar-right">
            <button className="rhu-notif-btn">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </button>
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
              <h1 className="rhu-page-title">System Overview</h1>
              <p className="rhu-page-sub">Real-time status of healthcare distribution and inventory levels.</p>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="rhu-stats-grid">
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL INVENTORY</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">{inventory.length}</span>
                <span className="rhu-stat-arrow">›</span>
              </div>
            </div>
            <div className="rhu-stat-card rhu-stat--orange">
              <p className="rhu-stat-label">LOW STOCK ALERTS</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">{lowStockItems.length}</span>
                <span className="rhu-stat-arrow">›</span>
              </div>
            </div>
            <div className="rhu-stat-card rhu-stat--red">
              <p className="rhu-stat-label">EXPIRING SOON</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">{expiringItems.length}</span>
                <span className="rhu-stat-arrow">›</span>
              </div>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL BARANGAYS</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">9</span></div>
              <p className="rhu-stat-sub">Active barangay health posts</p>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">DISTRIBUTIONS MADE</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{distributions.length}</span></div>
              <p className="rhu-stat-sub">To all barangays</p>
            </div>
          </div>

          {/* Latest Notifications */}
          <section className="rhu-section">
            <div className="rhu-section-hd">
              <h2 className="rhu-section-title">Latest Notifications</h2>
              <NavLink to="/rhu/notifications" className="rhu-view-all">View All</NavLink>
            </div>
            {notifications.length === 0 ? (
              <div className="rhu-empty-small">
                <p>No notifications yet. They will appear here once CHO distributes supplies.</p>
              </div>
            ) : (
              <div className="rhu-notif-list">
                {notifications.slice(0, 4).map(n => (
                  <div key={n.id} className="rhu-notif-item"
                    style={{ background: n.read ? "#f9fafb" : "#eff6ff", borderLeft: "3px solid #1a56db" }}>
                    <div className="rhu-notif-body">
                      <div>
                        <p className="rhu-notif-title">{n.title}</p>
                        <p className="rhu-notif-msg">{n.message}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Charts */}
          <div className="rhu-charts-row">
            <div className="rhu-chart-card">
              <div className="rhu-section-hd">
                <h2 className="rhu-section-title">Inventory by Category</h2>
                <span className="rhu-badge">Live</span>
              </div>
              {barData.length === 0 ? (
                <div className="rhu-empty-small"><p>No inventory data yet.</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={barData} barSize={36}>
                    <XAxis dataKey="category" tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} cursor={{ fill: "#f3f4f6" }} />
                    <Bar dataKey="value" fill="#93c5fd" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rhu-chart-card">
              <div className="rhu-section-hd">
                <h2 className="rhu-section-title">Distribution by Barangay</h2>
              </div>
              {pieData.length === 0 ? (
                <div className="rhu-empty-small"><p>No distribution data yet.</p></div>
              ) : (
                <>
                  <div className="rhu-donut-wrap">
                    <PieChart width={190} height={190}>
                      <Pie data={pieData} cx={90} cy={90} innerRadius={58} outerRadius={82}
                        dataKey="value" startAngle={90} endAngle={-270}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                    <div className="rhu-donut-center">
                      <p className="rhu-donut-pct">{pieTotal}</p>
                      <p className="rhu-donut-label">BOXES</p>
                    </div>
                  </div>
                  <div className="rhu-rhu-legend">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="rhu-rhu-row">
                        <span className="rhu-rhu-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="rhu-rhu-name">{d.name}</span>
                        <span className="rhu-rhu-pct">{d.value} boxes</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <section className="rhu-section">
            <div className="rhu-section-hd">
              <h2 className="rhu-section-title">Recent Activity</h2>
              <NavLink to="/rhu/reports" className="rhu-view-all">View All</NavLink>
            </div>
            {recentActivity.length === 0 ? (
              <div className="rhu-empty-small">
                <p>No recent activity. Logs will appear here as you manage inventory and distributions.</p>
              </div>
            ) : (
              <div className="rhu-activity-list">
                {recentActivity.map(a => (
                  <div key={a.id} className="rhu-activity-item">
                    <div className="rhu-activity-icon" style={{ background: a.color + "18", color: a.color }}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                      </svg>
                    </div>
                    <div className="rhu-activity-body">
                      <p className="rhu-activity-title">{a.title}</p>
                      <p className="rhu-activity-sub">{a.sub}</p>
                    </div>
                    <span className="rhu-activity-time">{a.time}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}