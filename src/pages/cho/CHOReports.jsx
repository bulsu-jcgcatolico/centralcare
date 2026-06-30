import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";

const navItems = [
  { label: "Dashboard",    to: "/cho/dashboard"    },
  { label: "Inventory",    to: "/cho/inventory"    },
  { label: "Distribution", to: "/cho/distribution" },
  { label: "Reports",      to: "/cho/reports"      },
  { label: "Notifications",to: "/cho/notifications"},
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function CHOReports() {
  const { logout } = useAuth();
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
        getDocs(query(collection(db, "inventory"), where("ownerType", "==", "cho"))),
        getDocs(query(collection(db, "distributions"), where("fromType", "==", "cho")))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data(), actType: "inventory" })));
      setDistributions(distSnap.docs.map(d => ({ id: d.id, ...d.data(), actType: "distribution" })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const allActivities = [
    ...inventory.map(i => ({
      ...i, actType: "inventory",
      displayName: i.name,
      displayQty:  `${i.quantity} boxes`,
      displayDate: i.date || new Date(i.createdAt?.seconds * 1000).toLocaleDateString() || "—",
      month: getMonthYear(i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : null))
    })),
    ...distributions.map(d => ({
      ...d, actType: "distribution",
      displayName: d.medicineName,
      displayQty:  `${d.totalBoxes} boxes to all RHUs`,
      displayDate: d.date || "—",
      month: getMonthYear(d.date)
    }))
  ];

  const months = [...new Set(allActivities.map(a => a.month).filter(Boolean))].sort().reverse();

  const displayed = selectedMonth === "all"
    ? allActivities
    : allActivities.filter(a => a.month === selectedMonth);

  const monthlyInvCount  = displayed.filter(a => a.actType === "inventory").length;
  const monthlyDistCount = displayed.filter(a => a.actType === "distribution").length;
  const monthlyTotalBoxes = distributions
    .filter(d => selectedMonth === "all" || getMonthYear(d.date) === selectedMonth)
    .reduce((s, d) => s + (d.totalBoxes || 0), 0);

  const periodLabel = selectedMonth === "all" ? "All time" : selectedMonth;

  return (
    <div>
      {/* ════════════════════ NORMAL SCREEN VIEW ════════════════════ */}
      <div className="cho-screen-only">
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
              <input className="cho-search" type="text" placeholder="Search reports..." />
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
                  <h1 className="cho-page-title">Activity Reports</h1>
                  <p className="cho-page-sub">Monthly summary of inventory additions and distributions.</p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <select className="cho-input" style={{ width: "auto", minWidth: "160px" }}
                    value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                    <option value="all">All Months</option>
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button className="cho-btn-primary" onClick={() => window.print()}>
                    Print / Export PDF
                  </button>
                </div>
              </div>

              <div className="cho-stats-grid cho-stats-grid--3">
                <div className="cho-stat-card">
                  <p className="cho-stat-label">ITEMS ADDED</p>
                  <div className="cho-stat-row"><span className="cho-stat-value">{monthlyInvCount}</span></div>
                  <p className="cho-stat-sub">{periodLabel}</p>
                </div>
                <div className="cho-stat-card">
                  <p className="cho-stat-label">DISTRIBUTIONS MADE</p>
                  <div className="cho-stat-row"><span className="cho-stat-value">{monthlyDistCount}</span></div>
                  <p className="cho-stat-sub">{periodLabel}</p>
                </div>
                <div className="cho-stat-card">
                  <p className="cho-stat-label">TOTAL BOXES DISTRIBUTED</p>
                  <div className="cho-stat-row"><span className="cho-stat-value">{monthlyTotalBoxes}</span></div>
                  <p className="cho-stat-sub">{periodLabel}</p>
                </div>
              </div>

              {loading ? (
                <div className="cho-empty-state"><p>Loading...</p></div>
              ) : displayed.length === 0 ? (
                <div className="cho-empty-state">
                  <div className="cho-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <h2 className="cho-empty-title">No Records for {periodLabel}</h2>
                  <p className="cho-empty-text">Records will appear here once you add inventory and create distributions.</p>
                </div>
              ) : (
                <section className="cho-section">
                  <table className="cho-table">
                    <thead>
                      <tr>
                        <th>TYPE</th>
                        <th>NAME</th>
                        <th>QUANTITY / DETAILS</th>
                        <th>MONTH</th>
                        <th>DATE</th>
                        <th>STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map(item => (
                        <tr key={item.id}>
                          <td>
                            <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "600",
                              background: item.actType === "distribution" ? "#eff6ff" : "#f0fdf4",
                              color: item.actType === "distribution" ? "#1a56db" : "#065f46" }}>
                              {item.actType === "distribution" ? "Distribution" : "Inventory"}
                            </span>
                          </td>
                          <td><strong>{item.displayName}</strong></td>
                          <td style={{ fontSize: "12px", color: "#6b7280" }}>{item.displayQty}</td>
                          <td style={{ fontSize: "12px", color: "#6b7280" }}>{item.month || "—"}</td>
                          <td>{item.displayDate}</td>
                          <td>
                            <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px",
                              fontWeight: "600", background: "#d1fae5", color: "#065f46" }}>
                              {item.status || "Active"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* ════════════════════ PRINT-ONLY VIEW ════════════════════ */}
      <div className="cho-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>Activity Reports</h1>
          <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>
            CHO — {periodLabel}
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Items Added:</strong> {monthlyInvCount}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Distributions Made:</strong> {monthlyDistCount}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Total Boxes Distributed:</strong> {monthlyTotalBoxes}
                </td>
              </tr>
            </tbody>
          </table>

          {displayed.length === 0 ? (
            <p style={{ fontSize: "13px" }}>No records for {periodLabel}.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr>
                  {["Type","Name","Quantity / Details","Month","Date","Status"].map(h => (
                    <th key={h} style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map(item => (
                  <tr key={item.id}>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>
                      {item.actType === "distribution" ? "Distribution" : "Inventory"}
                    </td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayName}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayQty}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.month || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayDate}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.status || "Active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .cho-screen-only { display: none !important; }
          .cho-print-only  { display: block !important; }
        }
      `}</style>
    </div>
  );
}