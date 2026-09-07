import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import {
  getPriorMonthKey, monthKeyLabel, recentMonthKeys,
  getAllSubmittedReports, displayFacilityName,
} from "../../utils/monthlyBalance";
import "./CHOBalanceReports.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Population Report", to: "/cho/population-report"  },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Balance Reports",   to: "/cho/balance-reports"    },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Messages",          to: "/cho/messages"           },
  { label: "Notifications",     to: "/cho/notifications"      },
];

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

export default function CHOBalanceReports() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [monthKey, setMonthKey] = useState(getPriorMonthKey());
  const [rhus, setRhus] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadRhus(); }, []);
  useEffect(() => { loadReports(); }, [monthKey]);

  async function loadRhus() {
    try {
      const snap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
      setRhus(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error("Error loading RHUs:", err); }
  }

  async function loadReports() {
    setLoading(true);
    try {
      const data = await getAllSubmittedReports("rhu", monthKey);
      setReports(data);
    } catch (err) { console.error("Error loading balance reports:", err); }
    setLoading(false);
  }

  const populationRhus = rhus.filter(r => (Number(r.totalPopulation) || 0) > 0);
  const submittedIds = new Set(reports.map(r => String(r.ownerId).trim().toLowerCase()));
  const missingRhus = populationRhus.filter(r => !submittedIds.has(String(r.id).trim().toLowerCase()));

  const displayedReports = reports.filter(r =>
    !search.trim() || displayFacilityName(r.ownerName).toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div>
      <div className="cho-balance-screen-only">
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
            <p className="rhu-brand-role">CHO ADMIN PANEL</p>
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
          <NavLink to="/cho/settings" className="rhu-nav-item rhu-nav-btn">Settings</NavLink>
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="rhu-main">
        <header className="rhu-topbar">
          <input className="rhu-search" type="text" placeholder="Search RHU name..." aria-label="Search"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="rhu-topbar-right">
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">CHO Admin</span>
                <span className="rhu-user-role">CHO Administrator</span>
              </div>
              <div className="rhu-avatar">SS</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header">
            <div>
              <h1 className="rhu-page-title">RHU Balance Reports</h1>
              <p className="rhu-page-sub">Review each RHU's Present End Balance submission before approving replenishment.</p>
            </div>
            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
              <select className="rhu-input" style={{ width: "auto", minWidth: "160px" }}
                value={monthKey} onChange={e => setMonthKey(e.target.value)}>
                {recentMonthKeys(6).map(mk => <option key={mk} value={mk}>{monthKeyLabel(mk)}</option>)}
              </select>
              <button className="rhu-btn-primary" onClick={() => window.print()}>Print / Export PDF</button>
            </div>
          </div>

          <div className="rhu-dist-stats-row">
            <div className="rhu-dist-stat-card">
              <div className="rhu-dist-stat-icon rhu-dist-icon--blue">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
                </svg>
              </div>
              <div>
                <p className="rhu-dist-stat-label">RHUs Submitted</p>
                <p className="rhu-dist-stat-value">{reports.length}</p>
              </div>
            </div>
            <div className="rhu-dist-stat-card">
              <div className="rhu-dist-stat-icon rhu-dist-icon--orange">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                </svg>
              </div>
              <div>
                <p className="rhu-dist-stat-label">RHUs Missing Report</p>
                <p className="rhu-dist-stat-value" style={{ color: missingRhus.length > 0 ? "#b91c1c" : undefined }}>{missingRhus.length}</p>
              </div>
            </div>
          </div>

          {missingRhus.length > 0 && (
            <div className="rhu-empty-state" style={{ background: "#fff7ed", border: "1px solid #fed7aa", padding: "12px 16px", marginBottom: "1.25rem", textAlign: "left" }}>
              <p style={{ margin: 0, color: "#9a3412", fontWeight: 600 }}>
                Missing {monthKeyLabel(monthKey)} report from: {missingRhus.map(r => displayFacilityName(r.rhuName)).join(", ")}
              </p>
              <p style={{ margin: "4px 0 0", color: "#9a3412", fontSize: "0.9rem" }}>
                These RHUs won't be included in the next replenishment split until they submit.
              </p>
            </div>
          )}

          {loading ? (
            <div className="rhu-empty-state"><p>Loading reports...</p></div>
          ) : displayedReports.length === 0 ? (
            <div className="rhu-empty-state">
              <h2 className="rhu-empty-title">No Reports for {monthKeyLabel(monthKey)}</h2>
              <p className="rhu-empty-text">Reports will appear here once an RHU submits their Present End Balance.</p>
            </div>
          ) : (
            <div>
              {displayedReports.map(r => (
                <div key={r.id} className="rhu-section" style={{ marginBottom: "14px", padding: 0, overflow: "hidden" }}>
                  <button
                    onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                    style={{
                      width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "16px 20px", background: "#f9fafb", border: "none", cursor: "pointer", textAlign: "left",
                      color: "#111827",
                    }}
                  >
                    <span>
                      <strong style={{ fontSize: "1.05rem", color: "#111827" }}>{displayFacilityName(r.ownerName) || r.ownerId}</strong>
                      <span style={{ marginLeft: "12px", fontSize: "0.9rem", color: "#6b7280" }}>
                        {r.items?.length ?? 0} item(s) · {r.totalEndBalance ?? 0} total end balance
                        {r.slowMovingCount > 0 && (
                          <span style={{ color: "#b45309", fontWeight: 600 }}> · {r.slowMovingCount} slow-moving</span>
                        )}
                      </span>
                    </span>
                    <span style={{ fontSize: "1.2rem", color: "#111827" }}>{expandedId === r.id ? "▲" : "▼"}</span>
                  </button>
                  {expandedId === r.id && (
                    <table className="rhu-table" style={{ width: "100%" }}>
                      <thead>
                        <tr><th>Item</th><th>Opening</th><th>Dispensed</th><th>End Balance</th><th>Movement</th></tr>
                      </thead>
                      <tbody>
                        {(r.items || []).map((it, idx) => (
                          <tr key={idx}>
                            <td style={{ padding: "10px 14px" }}>{it.name}{it.lotNumber ? ` (Lot ${it.lotNumber})` : ""}{it.isVaccine ? " 💉" : ""}</td>
                            <td style={{ padding: "10px 14px" }}>{it.openingBalance}</td>
                            <td style={{ padding: "10px 14px" }}>{it.dispensed}</td>
                            <td style={{ padding: "10px 14px" }}><strong>{it.endBalance}</strong></td>
                            <td style={{ padding: "10px 14px", color: it.movementRate < 20 ? "#b91c1c" : "#166534" }}>
                              {it.movementRate}% {it.movementRate < 20 ? "(slow-moving)" : ""}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
      </div>
      </div>

      <div className="cho-balance-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>RHU Balance Reports</h1>
          <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>{monthKeyLabel(monthKey)}</p>

          <p style={{ fontSize: "12px", margin: "0 0 4px" }}>
            <strong>Submitted:</strong> {reports.length} · <strong>Missing:</strong> {missingRhus.length}
            {missingRhus.length > 0 && ` (${missingRhus.map(r => displayFacilityName(r.rhuName)).join(", ")})`}
          </p>

          {reports.length === 0 ? (
            <p style={{ fontSize: "13px" }}>No reports submitted for {monthKeyLabel(monthKey)}.</p>
          ) : (
            reports.map(r => (
              <div key={r.id} style={{ marginTop: "16px", pageBreakInside: "avoid" }}>
                <h3 style={{ fontSize: "14px", margin: "0 0 4px" }}>
                  {displayFacilityName(r.ownerName) || r.ownerId}
                  {r.slowMovingCount > 0 && <span style={{ color: "#b45309" }}> — {r.slowMovingCount} slow-moving item(s)</span>}
                </h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "10px" }}>
                  <thead>
                    <tr>
                      {["Item", "Opening", "Dispensed", "End Balance", "Movement"].map(h => (
                        <th key={h} style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(r.items || []).map((it, idx) => (
                      <tr key={idx}>
                        <td style={{ border: "1px solid #999", padding: "6px" }}>{it.name}{it.lotNumber ? ` (Lot ${it.lotNumber})` : ""}</td>
                        <td style={{ border: "1px solid #999", padding: "6px" }}>{it.openingBalance}</td>
                        <td style={{ border: "1px solid #999", padding: "6px" }}>{it.dispensed}</td>
                        <td style={{ border: "1px solid #999", padding: "6px" }}>{it.endBalance}</td>
                        <td style={{ border: "1px solid #999", padding: "6px" }}>{it.movementRate}%{it.movementRate < 20 ? " (slow)" : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .cho-balance-screen-only { display: none !important; }
          .cho-balance-print-only  { display: block !important; }
        }
      `}</style>
    </div>
  );
}
