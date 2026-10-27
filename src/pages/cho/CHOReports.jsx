import { useState, useEffect } from "react";
import { useNavigate, NavLink, useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import {
  getPriorMonthKey, monthKeyLabel, recentMonthKeys,
  getAllSubmittedReports, displayFacilityName,
} from "../../utils/monthlyBalance";
// Optional stylesheets: loaded if the file exists, silently skipped if it was deleted,
// so a missing .css file can no longer crash the page.
import.meta.glob(["./CHOBalanceReports.css", "./CHORHUManagement.css", "./CHOPopulationReport.css"], { eager: true });

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Messages",          to: "/cho/messages"           },
  { label: "Notifications",     to: "/cho/notifications"      },
];

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";
const BARANGAYS_COLLECTION = "cho_barangays";
const DEFAULT_RHU_COUNT = 10;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function defaultRhuList() {
  return Array.from({ length: DEFAULT_RHU_COUNT }, (_, i) => ({
    id: String(i + 1),
    rhuName: `RHU ${i + 1}`,
    address: "",
    contactPerson: "",
    totalPopulation: 0,
    assignedBarangays: [],
  }));
}

const TABS = [
  { key: "activity",   label: "Activity Reports" },
  { key: "balance",    label: "RHU Balance Reports" },
  { key: "population", label: "Population Report" },
];
const PLACEHOLDERS = {
  activity: "Search reports...",
  balance: "Search RHU name...",
  population: "Search RHU or barangay name...",
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
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [inventory, setInventory] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, distSnap] = await Promise.all([
        getDocs(query(collection(db, "cho_batches"), where("ownerType", "==", "cho"), where("status", "==", "Accepted"))),
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
      displayDate: i.manufactureDate || i.expiryDate || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : "—"),
      month: getMonthYear(i.manufactureDate || i.expiryDate || (i.createdAt?.seconds ? new Date(i.createdAt.seconds * 1000).toLocaleDateString() : null))
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
              <div className="cho-page-header">
                <div>
                  <h1 className="cho-page-title">Activity Reports</h1>
                  <p className="cho-page-sub">Monthly summary of accepted inventory additions and distributions.</p>
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
                  <p className="cho-stat-label">ACCEPTED ITEMS ADDED</p>
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
                  <p className="cho-empty-text">Accepted inventory batches and distributions will appear here.</p>
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
                              {item.status || "Accepted"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
      </div>

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
                  <strong>Accepted Items Added:</strong> {monthlyInvCount}
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
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{item.status || "Accepted"}</td>
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
  const [monthKey, setMonthKey] = useState(getPriorMonthKey());
  const [rhus, setRhus] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState(null);

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
      const numOf = (r) => Number(String(r.ownerId ?? r.ownerName ?? "").match(/\d+/)?.[0] ?? 0);
      setReports([...data].sort((a, b) => numOf(a) - numOf(b)));
    } catch (err) { console.error("Error loading balance reports:", err); }
    setLoading(false);
  }

  // Firestore returns docs in an unspecified order (here, effectively by
  // document ID as a string), which sorts "RHU 10" right after "RHU 1"
  // instead of after "RHU 9". Sort numerically by the RHU number instead.
  const rhuNumber = (r) => Number(String(r.id ?? r.rhuName ?? "").match(/\d+/)?.[0] ?? 0);
  const populationRhus = rhus
    .filter(r => (Number(r.totalPopulation) || 0) > 0)
    .sort((a, b) => rhuNumber(a) - rhuNumber(b));
  const submittedIds = new Set(reports.map(r => String(r.ownerId).trim().toLowerCase()));
  const missingRhus = populationRhus.filter(r => !submittedIds.has(String(r.id).trim().toLowerCase()));

  const displayedReports = reports.filter(r =>
    !search.trim() || displayFacilityName(r.ownerName).toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <>
      <div className="reports-screen-only">
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

    </>
  );
}

function PopulationTab({ search }) {
  const [rhus, setRhus] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState(false);

  // View Mode: 'rhu' or 'barangay'
  const [activeTab, setActiveTab] = useState("rhu");

  // Selection for Custom Combination / Printing
  const [selectedRhuIds, setSelectedRhuIds] = useState([]);
  const [selectedBarangayIds, setSelectedBarangayIds] = useState([]);

  // Filters State
  const [reportTimeframe, setReportTimeframe] = useState("monthly");
  const [reportYear, setReportYear] = useState(new Date().getFullYear());
  const [reportMonth, setReportMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => { 
    loadReportData(); 
  }, []);

  async function loadReportData() {
    setLoading(true);
    try {
      // 1. Fetch Master Barangays first to construct lookup map
      const barangaySnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
      const bMap = {}; // Lookup map by barangay name
      const fetchedBarangays = barangaySnap.docs.map(d => {
        const data = d.data();
        const bName = data.barangayName || d.id;
        const pop = Number(data.population ?? data.totalPopulation ?? 0);

        const bItem = {
          id: d.id,
          barangayName: bName,
          totalPopulation: pop,
          assignedRhu: "Unassigned",
        };

        bMap[bName] = bItem;
        return bItem;
      });

      // 2. Fetch RHU Registry
      const rhuSnap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
      let fetchedRhus = [];
      if (rhuSnap.empty) {
        fetchedRhus = defaultRhuList();
      } else {
        const saved = {};
        rhuSnap.docs.forEach(d => { saved[d.id] = d.data(); });
        fetchedRhus = defaultRhuList().map(rhu => ({
          ...rhu,
          ...saved[rhu.id],
        }));
      }

      // Map assigned barangays to RHU Name & dynamically aggregate RHU total population
      fetchedRhus = fetchedRhus.map(rhu => {
        const assignedList = rhu.assignedBarangays || [];
        
        let calculatedPop = 0;
        assignedList.forEach(bName => {
          if (bMap[bName]) {
            bMap[bName].assignedRhu = rhu.rhuName;
            calculatedPop += bMap[bName].totalPopulation;
          }
        });

        return {
          ...rhu,
          // RHU population is the combined population of each assigned barangay
          totalPopulation: calculatedPop,
        };
      });

      setRhus(fetchedRhus);

      fetchedBarangays.sort((a, b) => a.barangayName.localeCompare(b.barangayName));
      setBarangays(fetchedBarangays);

    } catch (err) {
      console.error(err);
      setRhus(defaultRhuList());
    }
    setLoading(false);
  }

  // Toggle Selection Logic
  function toggleSelectAllRhus() {
    if (selectedRhuIds.length === rhus.length) {
      setSelectedRhuIds([]);
    } else {
      setSelectedRhuIds(rhus.map(r => r.id));
    }
  }

  function toggleSelectRhu(id) {
    setSelectedRhuIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function toggleSelectAllBarangays() {
    if (selectedBarangayIds.length === barangays.length) {
      setSelectedBarangayIds([]);
    } else {
      setSelectedBarangayIds(barangays.map(b => b.id));
    }
  }

  function toggleSelectBarangay(id) {
    setSelectedBarangayIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  function handlePrintReport() {
    window.print();
  }

  // Metrics Calculations
  const overallRhuPopulation = rhus.reduce((sum, r) => sum + (Number(r.totalPopulation) || 0), 0);
  const overallBarangayPopulation = barangays.reduce((sum, b) => sum + (Number(b.totalPopulation) || 0), 0);

  // Filter lists for Printing based on checkbox selection (or print all if none checked)
  const printRhusList = selectedRhuIds.length > 0 
    ? rhus.filter(r => selectedRhuIds.includes(r.id)) 
    : rhus;

  const printBarangaysList = selectedBarangayIds.length > 0 
    ? barangays.filter(b => selectedBarangayIds.includes(b.id)) 
    : barangays;

  const printRhuTotal = printRhusList.reduce((sum, r) => sum + (Number(r.totalPopulation) || 0), 0);
  const printBarangayTotal = printBarangaysList.reduce((sum, b) => sum + (Number(b.totalPopulation) || 0), 0);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  return (
    <>
          {/* Printable Document Header */}
          <div className="print-header-only">
            <h1>CentralCare - City Health Office</h1>
            <h2>{activeTab === "rhu" ? "RHU Population Demographics Report" : "Barangay Population Demographics Report"}</h2>
            <p>Period: {reportTimeframe === "monthly" ? `${monthNames[reportMonth - 1]} ${reportYear}` : `Year ${reportYear}`}</p>
            <p>Generated Date: {new Date().toLocaleDateString()}</p>
            <hr />
          </div>

          <div className="cho-page-header no-print">
            <div>
              <h1 className="cho-page-title">Population Report</h1>
              <p className="cho-page-sub">View population data by RHU or Barangay, and export combined printable reports.</p>
            </div>
          </div>

          {/* ── STATS GRID WITH MALOLOS TOTAL POPULATION CARD ── */}
          <div className="cho-stats-grid no-print">
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL MALOLOS POPULATION</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{overallBarangayPopulation.toLocaleString()}</span>
              </div>
              <p className="cho-page-sub" style={{ fontSize: "0.75rem", marginTop: "4px" }}>
                Combined population of all barangays
              </p>
            </div>
            
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL REGISTERED RHUS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{rhus.length}</span></div>
            </div>

            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL REGISTERED BARANGAYS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{barangays.length}</span></div>
            </div>
          </div>

          {loading ? (
            <div className="cho-empty-state"><p>Loading population data...</p></div>
          ) : (
            <section className="cho-section printable-report-section">
              <div className="cho-report-toolbar no-print">
                {/* View Switcher Tabs */}
                <div className="cho-view-tabs">
                  <button 
                    className={`cho-tab-btn ${activeTab === "rhu" ? "active" : ""}`}
                    onClick={() => setActiveTab("rhu")}
                  >
                    RHU Breakdown
                  </button>
                  <button 
                    className={`cho-tab-btn ${activeTab === "barangay" ? "active" : ""}`}
                    onClick={() => setActiveTab("barangay")}
                  >
                    Barangay Breakdown
                  </button>
                </div>

                <div className="cho-report-controls">
                  <div className="cho-btn-group">
                    <button
                      className={`cho-toggle-btn ${reportTimeframe === "monthly" ? "active" : ""}`}
                      onClick={() => setReportTimeframe("monthly")}
                    >
                      Monthly
                    </button>
                    <button
                      className={`cho-toggle-btn ${reportTimeframe === "yearly" ? "active" : ""}`}
                      onClick={() => setReportTimeframe("yearly")}
                    >
                      Yearly
                    </button>
                  </div>

                  {reportTimeframe === "monthly" && (
                    <select
                      className="cho-input cho-select-sm"
                      value={reportMonth}
                      onChange={e => setReportMonth(Number(e.target.value))}
                    >
                      {monthNames.map((m, idx) => (
                        <option key={m} value={idx + 1}>{m}</option>
                      ))}
                    </select>
                  )}

                  <select
                    className="cho-input cho-select-sm"
                    value={reportYear}
                    onChange={e => setReportYear(Number(e.target.value))}
                  >
                    {[2024, 2025, 2026, 2027].map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>

                  <button className="cho-btn-primary cho-btn-print" onClick={handlePrintReport}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
                      <polyline points="6 9 6 2 18 2 18 9"></polyline>
                      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                      <rect x="6" y="14" width="12" height="8"></rect>
                    </svg>
                    Print Selected ({activeTab === "rhu" 
                      ? (selectedRhuIds.length > 0 ? selectedRhuIds.length : "All") 
                      : (selectedBarangayIds.length > 0 ? selectedBarangayIds.length : "All")})
                  </button>
                </div>
              </div>

              {/* ── RHU TABLE VIEW ── */}
              {activeTab === "rhu" && (
                <div className="cho-table-wrapper">
                  <table className="cho-table cho-report-table">
                    <thead>
                      <tr>
                        <th className="no-print" style={{ width: "40px", textAlign: "center" }}>
                          <input 
                            type="checkbox" 
                            checked={selectedRhuIds.length === rhus.length && rhus.length > 0} 
                            onChange={toggleSelectAllRhus}
                          />
                        </th>
                        <th>RHU NAME</th>
                        <th>BARANGAYS COVERED</th>
                        <th>POPULATION COUNT</th>
                        <th>SHARE OF TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rhus.filter(rhu =>
                        (rhu.rhuName || "").toLowerCase().includes(search.trim().toLowerCase())
                      ).map(rhu => {
                        const pop = Number(rhu.totalPopulation) || 0;
                        const share = overallRhuPopulation > 0 ? ((pop / overallRhuPopulation) * 100).toFixed(1) : "0.0";
                        const isSelected = selectedRhuIds.includes(rhu.id);
                        
                        return (
                          <tr key={`report-${rhu.id}`} className={isSelected ? "row-selected" : ""}>
                            <td className="no-print" style={{ textAlign: "center" }}>
                              <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => toggleSelectRhu(rhu.id)}
                              />
                            </td>
                            <td><strong>{rhu.rhuName}</strong></td>
                            <td>{(rhu.assignedBarangays || []).length} Barangays</td>
                            <td><strong>{pop.toLocaleString()}</strong></td>
                            <td><span className="cho-subcategory-pill">{share}%</span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="cho-report-summary-row">
                        <td className="no-print"></td>
                        <td><strong>TOTAL POPULATION</strong></td>
                        <td><strong>{printRhusList.reduce((sum, r) => sum + (r.assignedBarangays || []).length, 0)} Barangays</strong></td>
                        <td className="summary-count"><strong>{printRhuTotal.toLocaleString()}</strong></td>
                        <td><strong>100.0%</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}

              {/* ── BARANGAY TABLE VIEW ── */}
              {activeTab === "barangay" && (
                <div className="cho-table-wrapper">
                  <table className="cho-table cho-report-table">
                    <thead>
                      <tr>
                        <th className="no-print" style={{ width: "40px", textAlign: "center" }}>
                          <input 
                            type="checkbox" 
                            checked={selectedBarangayIds.length === barangays.length && barangays.length > 0} 
                            onChange={toggleSelectAllBarangays}
                          />
                        </th>
                        <th>BARANGAY NAME</th>
                        <th>ASSIGNED RHU</th>
                        <th>POPULATION COUNT</th>
                        <th>SHARE OF TOTAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {barangays.length === 0 ? (
                        <tr>
                          <td colSpan="5" style={{ textAlign: "center", padding: "2rem" }}>
                            No barangays found. Add barangays in the Barangay module first.
                          </td>
                        </tr>
                      ) : barangays.filter(b =>
                          (b.barangayName || b.id || "").toLowerCase().includes(search.trim().toLowerCase())
                        ).length === 0 ? (
                        <tr>
                          <td colSpan="5" style={{ textAlign: "center", padding: "2rem" }}>
                            No barangays match "{search}".
                          </td>
                        </tr>
                      ) : (
                        barangays.filter(b =>
                          (b.barangayName || b.id || "").toLowerCase().includes(search.trim().toLowerCase())
                        ).map(b => {
                          const pop = Number(b.totalPopulation) || 0;
                          const share = overallBarangayPopulation > 0 ? ((pop / overallBarangayPopulation) * 100).toFixed(1) : "0.0";
                          const isSelected = selectedBarangayIds.includes(b.id);

                          return (
                            <tr key={`b-report-${b.id}`} className={isSelected ? "row-selected" : ""}>
                              <td className="no-print" style={{ textAlign: "center" }}>
                                <input 
                                  type="checkbox" 
                                  checked={isSelected} 
                                  onChange={() => toggleSelectBarangay(b.id)}
                                />
                              </td>
                              <td><strong>{b.barangayName}</strong></td>
                              <td>
                                <span className={b.assignedRhu !== "Unassigned" ? "cho-barangay-chip" : "cho-product-key"}>
                                  {b.assignedRhu}
                                </span>
                              </td>
                              <td><strong>{pop.toLocaleString()}</strong></td>
                              <td><span className="cho-subcategory-pill">{share}%</span></td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="cho-report-summary-row">
                        <td className="no-print"></td>
                        <td><strong>TOTAL POPULATION</strong></td>
                        <td><strong>{printBarangaysList.length} Barangays</strong></td>
                        <td className="summary-count"><strong>{printBarangayTotal.toLocaleString()}</strong></td>
                        <td><strong>100.0%</strong></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </section>
          )}
    </>
  );
}

export default function CHOReports() {
  const { logout } = useAuth();
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
                  {item.label === "Notifications" && Boolean(unreadCount) && (
                    <span className="nav-badge">{unreadCount}</span>
                  )}
                  {item.label === "Messages" && Boolean(unreadMessages) && (
                    <span className="nav-badge">{unreadMessages}</span>
                  )}
                </NavLink>
              ))}
            </nav>
            <div className="cho-sidebar-footer">
              <NavLink to="/cho/settings" className={({ isActive }) => "cho-nav-item cho-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
              <button className="cho-nav-item cho-nav-btn cho-signout" onClick={handleLogout}>Sign out</button>
            </div>
          </aside>

          <div className="cho-main">
            <header className="cho-topbar">
              <input className="cho-search" type="text" placeholder={searchPlaceholder}
                value={search} onChange={e => setSearch(e.target.value)} />
              <div className="cho-topbar-right">
                <div className="cho-user">
                  <div className="cho-user-info">
                    <span className="cho-user-name">CHO Admin</span>
                    <span className="cho-user-role">CHO Administrator</span>
                  </div>
                  <div className="cho-avatar">SS</div>
                </div>
              </div>
            </header>

            <main className="cho-content">
              <ReportTabs tabs={TABS} active={tab} onChange={changeTab} />
              {tab === "activity" && <ActivityTab search={search} />}
              {tab === "balance" && <BalanceTab search={search} />}
              {tab === "population" && <PopulationTab search={search} />}
            </main>
          </div>
        </div>

      <style>{`
        @media print {
          .cho-sidebar, .cho-topbar, .reports-tabbar, .reports-screen-only { display: none !important; }
          .cho-print-only, .cho-balance-print-only { display: block !important; }
          .cho-main { margin-left: 0 !important; }
        }
      `}</style>
    </div>
  );
}