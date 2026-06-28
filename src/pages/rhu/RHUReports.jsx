import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"      },
  { label: "Inventory",     to: "/rhu/inventory"      },
  { label: "Distribution",  to: "/rhu/distribution"   },
  { label: "Reports",       to: "/rhu/reports"        },
  { label: "Notifications", to: "/rhu/notifications"  },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function RHUReports() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [inventory, setInventory] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, distSnap] = await Promise.all([
        getDocs(query(collection(db, "inventory"),
          where("ownerType", "==", "rhu"),
          where("rhuId", "==", userData?.rhuId ?? ""))),
        getDocs(query(collection(db, "rhu_distributions"),
          where("fromRhuId", "==", userData?.rhuId ?? "")))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDistributions(distSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const allActivities = [
    ...inventory.map(i => ({
      ...i, actType: "inventory",
      displayName: i.name,
      displayQty:  `${i.quantity} boxes added`,
      displayDate: i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : "—"),
      month: getMonthYear(i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : null))
    })),
    ...distributions.map(d => ({
      ...d, actType: "distribution",
      displayName: d.medicineName,
      displayQty:  `${d.totalBoxes} boxes to ${d.barangayDistribution?.length || 0} barangays`,
      displayDate: d.date || "—",
      month: getMonthYear(d.date)
    }))
  ];

  const months = [...new Set(allActivities.map(a => a.month).filter(Boolean))].sort().reverse();

  const displayed = selectedMonth === "all"
    ? allActivities
    : allActivities.filter(a => a.month === selectedMonth);

  const monthlyInvCount   = displayed.filter(a => a.actType === "inventory").length;
  const monthlyDistCount  = displayed.filter(a => a.actType === "distribution").length;
  const monthlyTotalBoxes = distributions
    .filter(d => selectedMonth === "all" || getMonthYear(d.date) === selectedMonth)
    .reduce((s, d) => s + (d.totalBoxes || 0), 0);

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
              {item.label === "Notifications" && unreadCount && (
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
          <input className="rhu-search" type="text" placeholder="Search reports..." />
          <div className="rhu-topbar-right">
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">{userData?.username || "RHU Admin"}</span>
                <span className="rhu-user-role">{userData?.rhuName || "RHU Unit"}</span>
              </div>
              <div className="rhu-avatar">RH</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header">
            <div>
              <h1 className="rhu-page-title">Activity Reports</h1>
              <p className="rhu-page-sub">Monthly summary of inventory and distribution activities for {userData?.rhuName}.</p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <select className="rhu-input" style={{ width: "auto", minWidth: "160px" }}
                value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                <option value="all">All Months</option>
                {months.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button className="rhu-btn-secondary" onClick={() => window.print()}>
                Print / Export PDF
              </button>
            </div>
          </div>

          <div className="rhu-stats-grid rhu-stats-grid--3">
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">ITEMS ADDED</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{monthlyInvCount}</span></div>
              <p className="rhu-stat-sub">{selectedMonth === "all" ? "All time" : selectedMonth}</p>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">DISTRIBUTIONS MADE</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{monthlyDistCount}</span></div>
              <p className="rhu-stat-sub">{selectedMonth === "all" ? "All time" : selectedMonth}</p>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL BOXES DISTRIBUTED</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{monthlyTotalBoxes}</span></div>
              <p className="rhu-stat-sub">{selectedMonth === "all" ? "All time" : selectedMonth}</p>
            </div>
          </div>

          {loading ? (
            <div className="rhu-empty-small"><p>Loading...</p></div>
          ) : displayed.length === 0 ? (
            <div className="rhu-empty-state">
              <div className="rhu-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                </svg>
              </div>
              <h2 className="rhu-empty-title">No Records for {selectedMonth === "all" ? "any month" : selectedMonth}</h2>
              <p className="rhu-empty-text">Records will appear here once you add inventory and create distributions.</p>
            </div>
          ) : (
            <section className="rhu-section">
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                    <tr>
                      {["TYPE","NAME","QUANTITY / DETAILS","MONTH","DATE","STATUS"].map(h => (
                        <th key={h} style={{ padding: "10px 14px", textAlign: "left",
                          fontSize: "11px", fontWeight: "600", color: "#6b7280",
                          textTransform: "uppercase", whiteSpace: "nowrap" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayed.map(item => (
                      <tr key={item.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                        <td style={{ padding: "13px 14px" }}>
                          <span style={{ padding: "4px 10px", borderRadius: "6px",
                            fontSize: "11px", fontWeight: "600",
                            background: item.actType === "distribution" ? "#eff6ff" : "#f0fdf4",
                            color: item.actType === "distribution" ? "#1a56db" : "#065f46" }}>
                            {item.actType === "distribution" ? "Distribution" : "Inventory"}
                          </span>
                        </td>
                        <td style={{ padding: "13px 14px" }}><strong>{item.displayName}</strong></td>
                        <td style={{ padding: "13px 14px", color: "#6b7280", fontSize: "12px" }}>{item.displayQty}</td>
                        <td style={{ padding: "13px 14px", color: "#6b7280", fontSize: "12px" }}>{item.month || "—"}</td>
                        <td style={{ padding: "13px 14px" }}>{item.displayDate}</td>
                        <td style={{ padding: "13px 14px" }}>
                          <span style={{ padding: "4px 10px", borderRadius: "6px",
                            fontSize: "11px", fontWeight: "600",
                            background: "#d1fae5", color: "#065f46" }}>
                            {item.status || "Active"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}