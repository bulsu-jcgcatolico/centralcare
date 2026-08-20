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
import "./CHODashboard.css";

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

const PIE_COLORS = ["#1a56db", "#93c5fd", "#dbeafe", "#bfdbfe", "#eff6ff"];

export default function CHODashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [search, setSearch] = useState("");
  const [inventory, setInventory] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [totalMalolosPopulation, setTotalMalolosPopulation] = useState(0);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, distSnap, notifSnap, barangaySnap] = await Promise.all([
        getDocs(collection(db, "inventory")),
        getDocs(query(collection(db, "distributions"), where("fromType", "==", "cho"))),
        getDocs(query(collection(db, "notifications"), where("fromType", "==", "cho"))),
        getDocs(collection(db, "cho_barangays"))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDistributions(distSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setNotifications(notifSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const totalPop = barangaySnap.docs.reduce((sum, doc) => {
        const data = doc.data();
        return sum + Number(data.population ?? data.totalPopulation ?? 0);
      }, 0);
      setTotalMalolosPopulation(totalPop);

    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const lowStockItems   = inventory.filter(i => (i.remaining ?? i.quantity) <= 50);
  const criticalItems   = inventory.filter(i => (i.remaining ?? i.quantity) <= 20);
  const expiringItems   = inventory.filter(i => {
    if (!i.expiry) return false;
    const days = (new Date(i.expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= 30 && days >= 0;
  });

  const categoryMap = {};
  inventory.forEach(i => {
    const cat = i.category || "Other";
    categoryMap[cat] = (categoryMap[cat] || 0) + (i.remaining ?? i.quantity ?? 0);
  });
  const barData = Object.entries(categoryMap).map(([category, value]) => ({ category, value }));

  const rhuMap = {};
  distributions.forEach(d => {
    (d.rhuDistribution || []).forEach(r => {
      rhuMap[r.name] = (rhuMap[r.name] || 0) + (r.boxes || 0);
    });
  });

  const pieData = Object.entries(rhuMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => {
      const matchA = a.name.match(/\d+/);
      const matchB = b.name.match(/\d+/);
      const numA = matchA ? parseInt(matchA[0], 10) : 0;
      const numB = matchB ? parseInt(matchB[0], 10) : 0;
      return numA - numB;
    })
    .slice(0, 5);

  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);

  const recentActivity = [
    ...inventory.map(i => ({
      id: i.id,
      title: `Added: ${i.name}`,
      sub: `${i.quantity} boxes — ${i.category}`,
      time: i.date || "—",
      color: "#1a56db"
    })),
    ...distributions.map(d => ({
      id: d.id,
      title: `Distributed: ${d.medicineName}`,
      sub: `${d.totalBoxes} boxes to all RHUs`,
      time: d.date || "—",
      color: "#16a34a"
    }))
  ].slice(0, 5);

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
          <input className="cho-search" type="text"
            placeholder="Search medical supplies, RHUs, or records..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="cho-topbar-right">
            <button className="cho-notif-btn">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </button>
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
              <h1 className="cho-page-title">System Overview</h1>
              <p className="cho-page-sub">Real-time status of healthcare distribution and inventory levels.</p>
            </div>
          </div>

          <div className="cho-stats-grid">
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL MALOLOS POPULATION</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{totalMalolosPopulation.toLocaleString()}</span>
              </div>
              <p className="cho-stat-sub">Combined population of all barangays</p>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL INVENTORY</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{inventory.length}</span>
                <span className="cho-stat-arrow">›</span>
              </div>
            </div>
            <div className="cho-stat-card cho-stat--orange">
              <p className="cho-stat-label">LOW STOCK ALERTS</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{lowStockItems.length}</span>
                <span className="cho-stat-arrow">›</span>
              </div>
            </div>
            <div className="cho-stat-card cho-stat--red">
              <p className="cho-stat-label">EXPIRING SOON</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{expiringItems.length}</span>
                <span className="cho-stat-arrow">›</span>
              </div>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL RHUS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">10</span></div>
              <p className="cho-stat-sub">Rural Health Units</p>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">DISTRIBUTIONS MADE</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{distributions.length}</span></div>
              <p className="cho-stat-sub">Total distribution plans</p>
            </div>
          </div>

          <section className="cho-section">
            <div className="cho-section-hd">
              <h2 className="cho-section-title">Latest Notifications</h2>
              <NavLink to="/cho/notifications" className="cho-view-all">View All</NavLink>
            </div>
            {notifications.length === 0 ? (
              <div className="cho-empty-small">
                <p>No notifications yet. They will appear here once you start distributing inventory.</p>
              </div>
            ) : (
              <div className="cho-notif-list">
                {notifications.slice(0, 4).map(n => (
                  <div key={n.id} className="cho-notif-item"
                    style={{ background: "#f9fafb", borderLeft: "3px solid #1a56db" }}>
                    <div className="cho-notif-body">
                      <div>
                        <p className="cho-notif-title">{n.title}</p>
                        <p className="cho-notif-msg">{n.message}</p>
                      </div>
                    </div>
                    <span className="cho-notif-time">{n.date || "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <div className="cho-charts-row">
            <div className="cho-chart-card">
              <div className="cho-section-hd">
                <h2 className="cho-section-title">Inventory by Category</h2>
                <span className="cho-badge">Live</span>
              </div>
              {barData.length === 0 ? (
                <div className="cho-empty-small"><p>No inventory data yet.</p></div>
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

            <div className="cho-chart-card">
              <div className="cho-section-hd">
                <h2 className="cho-section-title">Distribution by RHU</h2>
              </div>
              {pieData.length === 0 ? (
                <div className="cho-empty-small"><p>No distribution data yet.</p></div>
              ) : (
                <>
                  <div className="cho-donut-wrap">
                    <PieChart width={190} height={190}>
                      <Pie data={pieData} cx={90} cy={90} innerRadius={58} outerRadius={82}
                        dataKey="value" startAngle={90} endAngle={-270}>
                        {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                    <div className="cho-donut-center">
                      <p className="cho-donut-pct">{pieTotal}</p>
                      <p className="cho-donut-label">BOXES</p>
                    </div>
                  </div>
                  <div className="cho-rhu-legend">
                    {pieData.map((d, i) => (
                      <div key={d.name} className="cho-rhu-row">
                        <span className="cho-rhu-dot" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="cho-rhu-name">{d.name}</span>
                        <span className="cho-rhu-pct">{d.value} boxes</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <section className="cho-section">
            <div className="cho-section-hd">
              <h2 className="cho-section-title">Recent Activity</h2>
              <NavLink to="/cho/reports" className="cho-view-all">View All</NavLink>
            </div>
            {recentActivity.length === 0 ? (
              <div className="cho-empty-small">
                <p>No recent activity. Logs will appear here as you manage inventory and distributions.</p>
              </div>
            ) : (
              <div className="cho-activity-list">
                {recentActivity.map(a => (
                  <div key={a.id} className="cho-activity-item">
                    <div className="cho-activity-icon" style={{ background: a.color + "18", color: a.color }}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
                        <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                      </svg>
                    </div>
                    <div className="cho-activity-body">
                      <p className="cho-activity-title">{a.title}</p>
                      <p className="cho-activity-sub">{a.sub}</p>
                    </div>
                    <span className="cho-activity-time">{a.time}</span>
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