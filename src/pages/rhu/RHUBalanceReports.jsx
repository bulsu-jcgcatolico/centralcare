import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import {
  getPriorMonthKey, monthKeyLabel, recentMonthKeys,
  getAllSubmittedReports, displayFacilityName,
} from "../../utils/monthlyBalance";
import "./RHUBalanceReports.css";

const navItems = [
  { label: "Dashboard",       to: "/rhu/dashboard"         },
  { label: "Inventory",       to: "/rhu/inventory"         },
  { label: "Barangay",        to: "/rhu/barangay"          },
  { label: "Distribution",    to: "/rhu/distribution"      },
  { label: "Balance Reports", to: "/rhu/balance-reports"   },
  { label: "Reports",         to: "/rhu/reports"           },
  { label: "Messages",        to: "/rhu/messages"          },
  { label: "Notifications",   to: "/rhu/notifications"     },
];

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

export default function RHUBalanceReports() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [monthKey, setMonthKey] = useState(getPriorMonthKey());
  const [barangays, setBarangays] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadAssignedBarangays(); }, [userData]);
  useEffect(() => { loadReports(); }, [monthKey]);

  async function loadAssignedBarangays() {
    try {
      const rhuId = String(userData?.rhuId ?? "").trim();
      if (!rhuId) { setBarangays([]); return; }

      const registrySnap = await getDoc(doc(db, RHU_REGISTRY_COLLECTION, rhuId));
      const assignedNames = registrySnap.exists() ? (registrySnap.data().assignedBarangays || []) : [];
      if (assignedNames.length === 0) { setBarangays([]); return; }

      const snap = await getDocs(collection(db, "cho_barangays"));
      const all = snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.barangayName || d.id,
            population: Number(data.totalPopulation ?? data.population ?? data.populationPercent ?? 0),
          };
        })
        .filter(b => assignedNames.includes(b.name));
      setBarangays(all);
    } catch (err) { console.error("Error loading barangays:", err); }
  }

  async function loadReports() {
    setLoading(true);
    try {
      const data = await getAllSubmittedReports("midwife", monthKey);
      setReports(data);
    } catch (err) { console.error("Error loading balance reports:", err); }
    setLoading(false);
  }

  const populationBarangays = barangays.filter(b => (Number(b.population) || 0) > 0);
  const submittedNames = new Set(reports.map(r => String(r.ownerId).trim().toLowerCase()));
  const missingBarangays = populationBarangays.filter(b => !submittedNames.has(String(b.name).trim().toLowerCase()));

  const displayedReports = reports.filter(r =>
    !search.trim() || (r.ownerName || "").toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div>
      <div className="rhu-balance-screen-only">
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
              {item.label === "Notifications" && Boolean(unreadCount) && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="rhu-sidebar-footer">
          <NavLink to="/rhu/settings" className="rhu-nav-item rhu-nav-btn">Settings</NavLink>
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="rhu-main">
        <header className="rhu-topbar">
          <input className="rhu-search" type="text" placeholder="Search barangay name..." aria-label="Search"
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="rhu-topbar-right">
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
            <h1 className="rhu-page-title">Midwife Balance Reports</h1>
            <p className="rhu-page-sub">Review each barangay's Present End Balance submission before approving replenishment.</p>
          </div>

          <div className="rhu-filter-export-row">
            <div className="rhu-filter-group">
              <select className="cho-input rhu-month-filter-select" value={monthKey} onChange={e => setMonthKey(e.target.value)}>
                {recentMonthKeys(6).map(mk => <option key={mk} value={mk}>{monthKeyLabel(mk)}</option>)}
              </select>
              <button className="cho-btn-export-pdf" onClick={() => window.print()}>Print / Export PDF</button>
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
                <p className="rhu-dist-stat-label">Barangays Submitted</p>
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
                <p className="rhu-dist-stat-label">Barangays Missing Report</p>
                <p className="rhu-dist-stat-value" style={{ color: missingBarangays.length > 0 ? "#b91c1c" : undefined }}>{missingBarangays.length}</p>
              </div>
            </div>
          </div>

          {missingBarangays.length > 0 && (
            <div className="rhu-empty-state" style={{ background: "#fff7ed", border: "1px solid #fed7aa", padding: "12px 16px", marginBottom: "1.25rem", textAlign: "left" }}>
              <p style={{ margin: 0, color: "#9a3412", fontWeight: 600 }}>
                Missing {monthKeyLabel(monthKey)} report from: {missingBarangays.map(b => b.name).join(", ")}
              </p>
              <p style={{ margin: "4px 0 0", color: "#9a3412", fontSize: "0.9rem" }}>
                These barangays won't be included in the next replenishment split until they submit.
              </p>
            </div>
          )}

          {loading ? (
            <div className="rhu-empty-state"><p>Loading reports...</p></div>
          ) : displayedReports.length === 0 ? (
            <div className="rhu-empty-state">
              <h2 className="rhu-empty-title">No Reports for {monthKeyLabel(monthKey)}</h2>
              <p className="rhu-empty-text">Reports will appear here once a barangay submits their Present End Balance.</p>
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
                      <strong style={{ fontSize: "1.05rem", color: "#111827" }}>{r.ownerName || r.ownerId}</strong>
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

      <div className="rhu-balance-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>Midwife Balance Reports</h1>
          <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>{monthKeyLabel(monthKey)}</p>

          <p style={{ fontSize: "12px", margin: "0 0 4px" }}>
            <strong>Submitted:</strong> {reports.length} · <strong>Missing:</strong> {missingBarangays.length}
            {missingBarangays.length > 0 && ` (${missingBarangays.map(b => b.name).join(", ")})`}
          </p>

          {reports.length === 0 ? (
            <p style={{ fontSize: "13px" }}>No reports submitted for {monthKeyLabel(monthKey)}.</p>
          ) : (
            reports.map(r => (
              <div key={r.id} style={{ marginTop: "16px", pageBreakInside: "avoid" }}>
                <h3 style={{ fontSize: "14px", margin: "0 0 4px" }}>
                  {r.ownerName || r.ownerId}
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
          .rhu-balance-screen-only { display: none !important; }
          .rhu-balance-print-only  { display: block !important; }
        }
      `}</style>
    </div>
  );
}
