import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Notifications", to: "/midwife/notifications" },
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
  const [activeTab, setActiveTab] = useState("all");
  const [inventory, setInventory] = useState([]);
  const [patients, setPatients] = useState([]);
  const [dispenseLogs, setDispenseLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, patSnap, dispSnap] = await Promise.all([
        getDocs(query(collection(db, "inventory"),
          where("ownerType", "==", "midwife"),
          where("barangayName", "==", userData?.barangayName ?? ""))),
        getDocs(query(collection(db, "patients"),
          where("barangayName", "==", userData?.barangayName ?? ""))),
        getDocs(query(collection(db, "dispense_logs"),
          where("barangayName", "==", userData?.barangayName ?? "")))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPatients(patSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDispenseLogs(dispSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const allActivities = [
    ...inventory.map(i => ({
      ...i, actType: "inventory",
      displayName: i.name,
      displayDetail: `${i.quantity} boxes added`,
      displayDate: i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : "—"),
      month: getMonthYear(i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : null))
    })),
    ...patients.map(p => ({
      ...p, actType: "patient",
      displayName: p.name || "—",
      displayDetail: `${p.type === "child" ? "Child" : "Adult"} patient — ${p.status || "active"}`,
      displayDate: p.lastVisit || p.date || (p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : "—"),
      month: getMonthYear(p.lastVisit || p.date || (p.createdAt?.seconds ? new Date(p.createdAt.seconds * 1000).toLocaleDateString() : null))
    })),
    ...dispenseLogs.map(d => ({
      ...d, actType: "dispense",
      displayName: `${d.medicineName} — ${d.patientName}`,
      displayDetail: `${d.boxesDispensed || 0} boxes (${d.tabletsDispensed || 0} tablets) dispensed`,
      displayDate: d.date || "—",
      month: getMonthYear(d.date)
    }))
  ];

  const months = [...new Set(allActivities.map(a => a.month).filter(Boolean))].sort().reverse();

  const byMonth = selectedMonth === "all"
    ? allActivities
    : allActivities.filter(a => a.month === selectedMonth);

  const displayed =
    activeTab === "inventory" ? byMonth.filter(a => a.actType === "inventory") :
    activeTab === "patients"  ? byMonth.filter(a => a.actType === "patient")   :
    activeTab === "dispense"  ? byMonth.filter(a => a.actType === "dispense")  :
    byMonth;

  const monthlyInvCount      = byMonth.filter(a => a.actType === "inventory").length;
  const monthlyPatientCount  = byMonth.filter(a => a.actType === "patient").length;
  const monthlyDispenseCount = byMonth.filter(a => a.actType === "dispense").length;
  const monthlyBoxesDispensed = dispenseLogs
    .filter(d => selectedMonth === "all" || getMonthYear(d.date) === selectedMonth)
    .reduce((s, d) => s + (d.boxesDispensed || 0), 0);

  const tagStyle = {
    inventory: { background: "#f0fdf4", color: "#065f46" },
    patient:   { background: "#eff6ff", color: "#1a56db" },
    dispense:  { background: "#fff7ed", color: "#d97706" },
  };

  const tabs = [
    { key: "all",       label: "All Activities"  },
    { key: "inventory", label: "Inventory Added" },
    { key: "patients",  label: "Patients"        },
    { key: "dispense",  label: "Dispensed Meds"  },
  ];

  const periodLabel = selectedMonth === "all" ? "All time" : selectedMonth;
  const printedOn = new Date().toLocaleDateString("en-US", { year: "numeric", month: "2-digit", day: "2-digit" });

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
              <input className="midwife-search" type="text" placeholder="Search reports..." />
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
                  <p className="midwife-page-sub">
                    Monthly summary for {userData?.barangayName} — patients, inventory, and dispensing.
                  </p>
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

              <div className="midwife-stats-grid midwife-stats-grid--4">
                <div className="midwife-stat-card-box">
                  <div className="midwife-stat-icon-box green">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                      <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="midwife-stat-label-box">Inventory Added</p>
                    <p className="midwife-stat-value-box">{monthlyInvCount}</p>
                  </div>
                </div>
                <div className="midwife-stat-card-box">
                  <div className="midwife-stat-icon-box blue">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="midwife-stat-label-box">Patients</p>
                    <p className="midwife-stat-value-box">{monthlyPatientCount}</p>
                  </div>
                </div>
                <div className="midwife-stat-card-box">
                  <div className="midwife-stat-icon-box orange">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                      <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="midwife-stat-label-box">Meds Dispensed</p>
                    <p className="midwife-stat-value-box">{monthlyDispenseCount}</p>
                  </div>
                </div>
                <div className="midwife-stat-card-box">
                  <div className="midwife-stat-icon-box purple">
                    <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                      <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="midwife-stat-label-box">Boxes Dispensed</p>
                    <p className="midwife-stat-value-box">{monthlyBoxesDispensed}</p>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "4px", borderBottom: "2px solid #e5e7eb", marginBottom: "1.5rem" }}>
                {tabs.map(tab => (
                  <button key={tab.key} onClick={() => setActiveTab(tab.key)} style={{
                    background: "none", border: "none",
                    borderBottom: `2px solid ${activeTab === tab.key ? "#1a56db" : "transparent"}`,
                    padding: "12px 20px", fontSize: "14px",
                    fontWeight: activeTab === tab.key ? "600" : "500",
                    color: activeTab === tab.key ? "#1a56db" : "#6b7280",
                    cursor: "pointer", marginBottom: "-2px"
                  }}>{tab.label}</button>
                ))}
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
                  <p className="midwife-empty-text">Records will appear here as you add inventory, register patients, and dispense medicines.</p>
                </div>
              ) : (
                <section className="midwife-section">
                  <div style={{ overflowX: "auto" }}>
                    <table className="midwife-table">
                      <thead>
                        <tr>
                          <th>TYPE</th>
                          <th>NAME / DESCRIPTION</th>
                          <th>DETAILS</th>
                          <th>MONTH</th>
                          <th>DATE</th>
                          <th>STATUS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayed.map(item => (
                          <tr key={item.id}>
                            <td>
                              <span style={{ padding: "4px 10px", borderRadius: "6px",
                                fontSize: "11px", fontWeight: "600",
                                ...tagStyle[item.actType] }}>
                                {item.actType === "inventory" ? "Inventory"
                                  : item.actType === "patient" ? "Patient"
                                  : "Dispensed"}
                              </span>
                            </td>
                            <td><strong>{item.displayName}</strong></td>
                            <td style={{ fontSize: "12px", color: "#6b7280" }}>{item.displayDetail}</td>
                            <td style={{ fontSize: "12px", color: "#6b7280" }}>{item.month || "—"}</td>
                            <td>{item.displayDate}</td>
                            <td>
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
      </div>

      {/* ════════════════════ PRINT-ONLY VIEW (official document style) ════════════════════ */}
      <div className="midwife-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "30px 40px" }}>

          <p style={{ fontSize: "11px", margin: "0 0 20px" }}>{printedOn}</p>

          <h1 style={{ fontSize: "20px", textAlign: "center", margin: "0 0 4px" }}>
            CentralCare Health System
          </h1>
          <p style={{ fontSize: "12px", textAlign: "center", margin: "0 0 4px" }}>
            Republic of the Philippines
          </p>
          <p style={{ fontSize: "12px", textAlign: "center", margin: "0 0 20px" }}>
            City of Malolos, Bulacan
          </p>
          <h2 style={{ fontSize: "18px", textAlign: "center", margin: "0 0 24px" }}>
            Activity Report — Barangay {userData?.barangayName}
          </h2>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px" }}>
            <tbody>
              <tr>
                <td style={{ padding: "4px 0", fontSize: "12px", width: "140px" }}><strong>Midwife</strong></td>
                <td style={{ padding: "4px 0", fontSize: "12px" }}>{userData?.username || "—"}</td>
                <td style={{ padding: "4px 0", fontSize: "12px", width: "140px" }}><strong>Period</strong></td>
                <td style={{ padding: "4px 0", fontSize: "12px" }}>{periodLabel}</td>
              </tr>
              <tr>
                <td style={{ padding: "4px 0", fontSize: "12px" }}><strong>Barangay</strong></td>
                <td style={{ padding: "4px 0", fontSize: "12px" }}>{userData?.barangayName || "—"}</td>
                <td style={{ padding: "4px 0", fontSize: "12px" }}><strong>Total Records</strong></td>
                <td style={{ padding: "4px 0", fontSize: "12px" }}>{displayed.length}</td>
              </tr>
            </tbody>
          </table>

          <hr style={{ border: "none", borderTop: "1px solid #333", margin: "10px 0 20px" }} />

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "24px" }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Inventory Added:</strong> {monthlyInvCount}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Patients:</strong> {monthlyPatientCount}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Meds Dispensed:</strong> {monthlyDispenseCount}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Boxes Dispensed:</strong> {monthlyBoxesDispensed}
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
                  {["Type","Name / Description","Details","Month","Date","Status"].map(h => (
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
                      {item.actType === "inventory" ? "Inventory"
                        : item.actType === "patient" ? "Patient"
                        : "Dispensed"}
                    </td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayName}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayDetail}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.month || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.displayDate}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.status || "Active"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <p style={{ fontSize: "11px", marginTop: "30px" }}>
            <strong>Date Printed:</strong> {printedOn}
          </p>
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