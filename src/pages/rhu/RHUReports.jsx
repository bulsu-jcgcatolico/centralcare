import { useState, useEffect } from "react";
import { useNavigate, NavLink, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { doc, getDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import {
  getPriorMonthKey, monthKeyLabel, recentMonthKeys,
  getAllSubmittedReports, displayFacilityName,
} from "../../utils/monthlyBalance";

const navItems = [
  { label: "Dashboard",       to: "/rhu/dashboard"         },
  { label: "Inventory",       to: "/rhu/inventory"         },
  { label: "Barangay",        to: "/rhu/barangay"          },
  { label: "Distribution",    to: "/rhu/distribution"      },
  { label: "Reports",         to: "/rhu/reports"           },
  { label: "Messages",        to: "/rhu/messages"          },
  { label: "Notifications",   to: "/rhu/notifications"     },
];

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

const TABS = [
  { key: "activity", label: "Activity Reports" },
  { key: "balance",  label: "Midwife Balance Reports" },
];
const PLACEHOLDERS = {
  activity: "Search reports...",
  balance: "Search barangay name...",
};

function ReportTabs({ tabs, active, onChange }) {
  return (
    <div className="reports-tabbar"
      style={{ display: "flex", gap: "4px", borderBottom: "1px solid #e5e7eb", marginBottom: "1.25rem", flexWrap: "wrap" }}>
      {tabs.map(t => (
        <button key={t.key} onClick={() => onChange(t.key)}
          style={{
            padding: "10px 18px", background: "none", border: "none", cursor: "pointer", marginBottom: "-1px",
            borderBottom: active === t.key ? "2px solid #2563eb" : "2px solid transparent",
            color: active === t.key ? "#1d4ed8" : "#6b7280",
            fontWeight: active === t.key ? 700 : 500, fontSize: "14px",
          }}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

function ActivityTab({ search }) {
  const { userData } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [inventory, setInventory] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, distSnap] = await Promise.all([
        getDocs(query(
          collection(db, "inventory"),
          where("ownerType", "==", "rhu"),
          where("rhuId", "==", userData?.rhuId ?? "")
        )),
        getDocs(query(
          collection(db, "rhu_distributions"),
          where("fromRhuId", "==", userData?.rhuId ?? "")
        ))
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
      displayDate: i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : "—"),
      month: getMonthYear(i.date || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : null))
    })),
    ...distributions.map(d => ({
      ...d, actType: "distribution",
      displayName: d.medicineName,
      displayQty:  `${d.totalBoxes} boxes to all barangays`,
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
  const monthlyDistCount = displayed.filter(a => a.actType === "distribution").length;
  const monthlyTotalBoxes = distributions
    .filter(d => selectedMonth === "all" || getMonthYear(d.date) === selectedMonth)
    .reduce((s, d) => s + (d.totalBoxes || 0), 0);

  const periodLabel = selectedMonth === "all" ? "All time" : selectedMonth;

  return (
    <>
      <div className="reports-screen-only">
              <div className="rhu-page-header">
                <div>
                  <h1 className="rhu-page-title">Activity Reports</h1>
                  <p className="rhu-page-sub">Monthly summary of inventory additions and distributions.</p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  <select className="rhu-input" style={{ width: "auto", minWidth: "160px" }}
                    value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                    <option value="all">All Months</option>
                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <button className="rhu-btn-primary" onClick={() => window.print()}>
                    Print / Export PDF
                  </button>
                </div>
              </div>

              <div className="rhu-stats-grid rhu-stats-grid--3">
                <div className="rhu-stat-card">
                  <p className="rhu-stat-label">ITEMS ADDED</p>
                  <div className="rhu-stat-row"><span className="rhu-stat-value">{monthlyInvCount}</span></div>
                  <p className="rhu-stat-sub">{periodLabel}</p>
                </div>
                <div className="rhu-stat-card">
                  <p className="rhu-stat-label">DISTRIBUTIONS MADE</p>
                  <div className="rhu-stat-row"><span className="rhu-stat-value">{monthlyDistCount}</span></div>
                  <p className="rhu-stat-sub">{periodLabel}</p>
                </div>
                <div className="rhu-stat-card">
                  <p className="rhu-stat-label">TOTAL BOXES DISTRIBUTED</p>
                  <div className="rhu-stat-row"><span className="rhu-stat-value">{monthlyTotalBoxes}</span></div>
                  <p className="rhu-stat-sub">{periodLabel}</p>
                </div>
              </div>

              {loading ? (
                <div className="rhu-empty-state"><p>Loading...</p></div>
              ) : displayed.length === 0 ? (
                <div className="rhu-empty-state">
                  <div className="rhu-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                      <path d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <h2 className="rhu-empty-title">No Records for {periodLabel}</h2>
                  <p className="rhu-empty-text">Records will appear here once you add inventory and create distributions.</p>
                </div>
              ) : (
                <section className="rhu-section">
                  <table className="rhu-table">
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
      </div>

      <div className="rhu-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>Activity Reports</h1>
          <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>
            {userData?.rhuName || "RHU"} — {periodLabel}
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

    </>
  );
}

function BalanceTab({ search }) {
  const { userData } = useAuth();
  const [monthKey, setMonthKey] = useState(getPriorMonthKey());
  const [barangays, setBarangays] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

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
      const normalizedAssignedNames = assignedNames.map(n => String(n).trim().toLowerCase());
      const all = snap.docs
        .map(d => {
          const data = d.data();
          return {
            id: d.id,
            name: data.barangayName || d.id,
            population: Number(data.totalPopulation ?? data.population ?? data.populationPercent ?? 0),
          };
        })
        .filter(b => normalizedAssignedNames.includes(String(b.name).trim().toLowerCase()));
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

  // getAllSubmittedReports() fetches every midwife report city-wide for the
  // month (it's shared with CHO's own review page, which legitimately needs
  // that). This RHU should only ever see reports from barangays actually
  // assigned to it — otherwise another RHU's barangay (e.g. Longos under
  // RHU 10) leaks into this RHU's own Balance Reports view.
  const assignedNameSet = new Set(barangays.map(b => String(b.name).trim().toLowerCase()));
  const scopedReports = reports.filter(r =>
    assignedNameSet.has(String(r.ownerId).trim().toLowerCase()) ||
    assignedNameSet.has(String(r.ownerName).trim().toLowerCase())
  );

  const submittedNames = new Set(scopedReports.map(r => String(r.ownerId).trim().toLowerCase()));
  const missingBarangays = populationBarangays.filter(b => !submittedNames.has(String(b.name).trim().toLowerCase()));

  const displayedReports = scopedReports.filter(r =>
    !search.trim() || (r.ownerName || "").toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <>
      <div className="reports-screen-only">
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
                <p className="rhu-dist-stat-value">{scopedReports.length}</p>
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
      </div>

      <div className="rhu-balance-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>Midwife Balance Reports</h1>
          <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>{monthKeyLabel(monthKey)}</p>

          <p style={{ fontSize: "12px", margin: "0 0 4px" }}>
            <strong>Submitted:</strong> {scopedReports.length} · <strong>Missing:</strong> {missingBarangays.length}
            {missingBarangays.length > 0 && ` (${missingBarangays.map(b => b.name).join(", ")})`}
          </p>

          {scopedReports.length === 0 ? (
            <p style={{ fontSize: "13px" }}>No reports submitted for {monthKeyLabel(monthKey)}.</p>
          ) : (
            scopedReports.map(r => (
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

    </>
  );
}

export default function RHUReports() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const unreadMessages = useUnreadMessageCount();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab");
  const tab = TABS.some(t => t.key === requested) ? requested : "activity";
  const [search, setSearch] = useState("");
  const searchPlaceholder = PLACEHOLDERS[tab];

  function handleLogout() { logout(); navigate("/"); }
  function changeTab(key) { setSearchParams({ tab: key }); setSearch(""); }

  return (
    <div>
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
                  {item.label === "Messages" && Boolean(unreadMessages) && (
                    <span className="nav-badge">{unreadMessages}</span>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="rhu-sidebar-footer">
              <NavLink to="/rhu/settings" className={({ isActive }) => "rhu-nav-item rhu-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
              <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign out</button>
            </div>
          </aside>

          <div className="rhu-main">
            <header className="rhu-topbar">
              <input className="rhu-search" type="text" placeholder={searchPlaceholder}
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
              <ReportTabs tabs={TABS} active={tab} onChange={changeTab} />
              {tab === "activity" && <ActivityTab search={search} />}
              {tab === "balance" && <BalanceTab search={search} />}
            </main>
          </div>
        </div>

      <style>{`
        @media print {
          .rhu-sidebar, .rhu-topbar, .reports-tabbar, .reports-screen-only { display: none !important; }
          .rhu-print-only, .rhu-balance-print-only { display: block !important; }
          .rhu-main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}