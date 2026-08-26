import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"      },
  { label: "Patients",      to: "/midwife/patients"       },
  { label: "Inventory",     to: "/midwife/inventory"      },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"        },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications"  },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function MidwifeReports() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [search, setSearch] = useState("");
  const [inventory, setInventory] = useState([]);
  const [dispenseLogs, setDispenseLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, dispSnap] = await Promise.all([
        getDocs(query(
          collection(db, "inventory"),
          where("ownerType", "==", "midwife"),
          where("barangayName", "==", userData?.barangayName ?? "")
        )),
        getDocs(query(
          collection(db, "dispense_logs"),
          where("barangayName", "==", userData?.barangayName ?? "")
        ))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data(), actType: "inventory" })));
      setDispenseLogs(dispSnap.docs.map(d => ({ id: d.id, ...d.data(), actType: "dispense" })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const allActivities = [
    ...inventory.map(i => ({
      ...i, actType: "inventory",
      displayName: i.name,
      displayQty:  `${i.quantity} boxes received`,
      displayDate: i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : "—"),
      month: getMonthYear(i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : null))
    })),
    ...dispenseLogs.map(d => ({
      ...d, actType: "dispense",
      displayName: d.medicineName,
      displayQty:  `${d.boxesDispensed} box${d.boxesDispensed !== 1 ? "es" : ""} to ${d.patientName || "patient"}`,
      displayDate: d.date || "—",
      month: getMonthYear(d.date)
    }))
  ];

  const months = [...new Set(allActivities.map(a => a.month).filter(Boolean))].sort().reverse();

  const displayed = (selectedMonth === "all"
    ? allActivities
    : allActivities.filter(a => a.month === selectedMonth)
  ).filter(a => (a.displayName || "").toLowerCase().includes(search.trim().toLowerCase()));

  const monthlyInvCount  = displayed.filter(a => a.actType === "inventory").length;
  const monthlyDispCount = displayed.filter(a => a.actType === "dispense").length;
  const monthlyBoxesDispensed = dispenseLogs
    .filter(d => selectedMonth === "all" || getMonthYear(d.date) === selectedMonth)
    .reduce((s, d) => s + (d.boxesDispensed || 0), 0);

  const periodLabel = selectedMonth === "all" ? "All time" : selectedMonth;

  return (
    <div>
      {/* ════════════════════ NORMAL SCREEN VIEW ════════════════════ */}
      <div className="midwife-screen-only">
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
              <NavLink to="/midwife/settings" className={({ isActive }) => "midwife-nav-item midwife-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
              <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>Sign Out</button>
            </div>
          </aside>

          <div className="midwife-main">
            <header className="midwife-topbar">
              <input className="midwife-search" type="text" placeholder="Search reports..."
                value={search} onChange={e => setSearch(e.target.value)} />
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
                  <h1 className="midwife-page-title">Activity Reports</h1>
                  <p className="midwife-page-sub">Monthly summary of medicine received and dispensed.</p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <select className="midwife-input" style={{ width: "auto", minWidth: "160px" }}
                    value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                    <option value="all">All Months</option>
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button className="midwife-btn-primary" onClick={() => window.print()}>
                    Print / Export PDF
                  </button>
                </div>
              </div>

              <div className="midwife-stats-grid midwife-stats-grid--3">
                <div className="midwife-stat-card-box">
                  <div className="midwife-stat-icon-box green">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="midwife-stat-label-box">ITEMS RECEIVED</p>
                    <p className="midwife-stat-value-box">{monthlyInvCount}</p>
                  </div>
                </div>
                <div className="midwife-stat-card-box">
                  <div className="midwife-stat-icon-box blue">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="midwife-stat-label-box">DISPENSED TO PATIENTS</p>
                    <p className="midwife-stat-value-box">{monthlyDispCount}</p>
                  </div>
                </div>
                <div className="midwife-stat-card-box">
                  <div className="midwife-stat-icon-box purple">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="midwife-stat-label-box">TOTAL BOXES DISPENSED</p>
                    <p className="midwife-stat-value-box">{monthlyBoxesDispensed}</p>
                  </div>
                </div>
              </div>

              {loading ? (
                <div className="midwife-empty-state"><p>Loading...</p></div>
              ) : displayed.length === 0 ? (
                <div className="midwife-empty-state">
                  <div className="midwife-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <h2 className="midwife-empty-title">No Records for {periodLabel}</h2>
                  <p className="midwife-empty-text">Records will appear here once you receive stock or dispense medicine.</p>
                </div>
              ) : (
                <section className="midwife-section">
                  <table className="midwife-table">
                    <thead>
                      <tr>
                        <th>TYPE</th>
                        <th>NAME</th>
                        <th>DETAILS</th>
                        <th>MONTH</th>
                        <th>DATE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {displayed.map(item => (
                        <tr key={item.id}>
                          <td>
                            <span style={{ padding: "4px 10px", borderRadius: "6px", fontSize: "11px", fontWeight: "600",
                              background: item.actType === "dispense" ? "#eff6ff" : "#f0fdf4",
                              color: item.actType === "dispense" ? "#1a56db" : "#065f46" }}>
                              {item.actType === "dispense" ? "Dispensed" : "Received"}
                            </span>
                          </td>
                          <td><strong>{item.displayName}</strong></td>
                          <td style={{ fontSize: "12px", color: "#6b7280" }}>{item.displayQty}</td>
                          <td style={{ fontSize: "12px", color: "#6b7280" }}>{item.month || "—"}</td>
                          <td>{item.displayDate}</td>
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
      <div className="midwife-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>Activity Reports</h1>
          <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>
            Barangay {userData?.barangayName || ""} — {periodLabel}
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Items Received:</strong> {monthlyInvCount}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Dispensed to Patients:</strong> {monthlyDispCount}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Total Boxes Dispensed:</strong> {monthlyBoxesDispensed}
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
                  {["Type","Name","Details","Month","Date"].map(h => (
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
                      {item.actType === "dispense" ? "Dispensed" : "Received"}
                    </td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayName}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayQty}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.month || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayDate}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .midwife-screen-only { display: none !important; }
          .midwife-print-only  { display: block !important; }
        }
      `}</style>
    </div>
  );
}