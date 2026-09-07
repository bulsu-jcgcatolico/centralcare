import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { summarizeWastageByVaccine } from "../../utils/vaccineWastage";
import { getCurrentMonthKey, monthKeyLabel, getBalanceReport } from "../../utils/monthlyBalance";
import { FHSIS_ANTIGENS, FHSIS_ANTIGEN_ORDER, buildImmunizationCoverageReport, buildCoverageReport } from "../../utils/fhsisImmunization";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "BHW & Campaigns", to: "/midwife/bhw"         },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
];

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthYear(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Build a list of the last `count` "YYYY-MM" month keys, most recent first,
 *  for the End-of-Month tab's month picker. */
function recentMonthKeys(count = 6) {
  const out = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/** The "YYYY-MM" immediately before a given monthKey — used to find last
 *  month's submitted balance report for the commodity report's "Beginning
 *  Balance" column. */
function monthBefore(monthKey) {
  const [y, m] = String(monthKey || "").split("-").map(Number);
  if (!y || !m) return monthKey;
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

  // "End-of-Month Report" tab — patient consumption + immunization/wastage
  // metrics, separate from the Activity Log tab above.
  const [activeTab, setActiveTab] = useState("activity"); // "activity" | "eom"
  const [immunizationLogs, setImmunizationLogs] = useState([]);
  const [eomMonthKey, setEomMonthKey] = useState(getCurrentMonthKey());

  // "FHSIS Report" tab — DOH-aligned immunization coverage + commodity report.
  const [beginningBalanceReport, setBeginningBalanceReport] = useState(null);
  const [thisMonthBalanceReport, setThisMonthBalanceReport] = useState(null);
  const [barangayPopulation, setBarangayPopulation] = useState(0);
  const [bhwUsageReports, setBhwUsageReports] = useState([]);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (activeTab !== "fhsis") return;
    async function loadBalanceReports() {
      const barangay = userData?.barangayName ?? "";
      if (!barangay) return;
      try {
        const [prior, current] = await Promise.all([
          getBalanceReport("midwife", barangay, monthBefore(eomMonthKey)),
          getBalanceReport("midwife", barangay, eomMonthKey),
        ]);
        setBeginningBalanceReport(prior);
        setThisMonthBalanceReport(current);
      } catch (err) { console.error("Error loading balance reports for FHSIS commodity report:", err); }
    }
    loadBalanceReports();
  }, [activeTab, eomMonthKey, userData?.barangayName]);

  async function loadData() {
    setLoading(true);
    try {
      const barangayName = userData?.barangayName ?? "";
      const [invSnap, dispSnap, immunSnap, barangaySnap, bhwUsageSnap] = await Promise.all([
        getDocs(query(
          collection(db, "inventory"),
          where("ownerType", "==", "midwife"),
          where("barangayName", "==", barangayName)
        )),
        getDocs(query(
          collection(db, "dispense_logs"),
          where("barangayName", "==", barangayName)
        )),
        getDocs(query(
          collection(db, "immunization_logs"),
          where("barangayName", "==", barangayName)
        )),
        barangayName ? getDoc(doc(db, "cho_barangays", barangayName)) : Promise.resolve(null),
        getDocs(query(
          collection(db, "bhw_usage_reports"),
          where("barangayName", "==", barangayName)
        ))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data(), actType: "inventory" })));
      setDispenseLogs(dispSnap.docs.map(d => ({ id: d.id, ...d.data(), actType: "dispense" })));
      setImmunizationLogs(immunSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setBhwUsageReports(bhwUsageSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      if (barangaySnap?.exists()) {
        setBarangayPopulation(Number(barangaySnap.data().totalPopulation) || 0);
      }
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

  // ── End-of-Month tab metrics ──
  const eomMonthOptions = recentMonthKeys(6);

  const eomDispenseLogs = dispenseLogs.filter(l => l.monthKey === eomMonthKey);
  const eomImmunizationLogs = immunizationLogs.filter(l => l.monthKey === eomMonthKey);

  // Aggregate BHW usage reports have no patientId (can't tie to a specific
  // child), so they can't participate in the Fully Immunized Child count —
  // but their dose totals are real and should still count toward the
  // antigen dose tally, same as this month's direct dispensing. Campaign
  // (e.g. MR-SIA) doses are excluded here too, same reasoning as routine
  // immunization_logs — see fhsisImmunization.js.
  const routineBhwDosesThisMonth = bhwUsageReports
    .filter(r => r.isVaccine && !r.campaignId && r.monthKey === eomMonthKey)
    .map(r => ({ fhsisAntigen: r.fhsisAntigen, doseLabel: r.doseLabel, dosesGiven: r.dosesGiven, campaignId: null }));

  const medicineBreakdown = {};
  eomDispenseLogs.forEach(l => {
    const key = l.medicineName || "Unknown";
    if (!medicineBreakdown[key]) medicineBreakdown[key] = { medicineName: key, events: 0, boxes: 0, tablets: 0, adults: 0, children: 0 };
    medicineBreakdown[key].events += 1;
    medicineBreakdown[key].boxes += Number(l.boxesDispensed) || 0;
    medicineBreakdown[key].tablets += Number(l.tabletsDispensed) || 0;
    if (l.patientType === "child") medicineBreakdown[key].children += 1;
    else medicineBreakdown[key].adults += 1;
  });
  const medicineRows = Object.values(medicineBreakdown).sort((a, b) => b.events - a.events);

  // Same routine (non-campaign) BHW doses, reshaped for the wastage
  // summary — split proportionally between children/adults counts since
  // aggregate reports don't tag each dose individually like a direct log.
  const routineBhwWastageEntries = bhwUsageReports
    .filter(r => r.isVaccine && !r.campaignId && r.monthKey === eomMonthKey)
    .flatMap(r => {
      const total = (Number(r.childrenCount) || 0) + (Number(r.adultsCount) || 0);
      if (total === 0) {
        return [{
          vaccineName: r.itemName, doseType: r.doseType, vialsUsed: r.quantityUsed,
          dosesGiven: r.dosesGiven, dosesWasted: r.dosesWasted, patientType: "child",
        }];
      }
      const childShare = (Number(r.childrenCount) || 0) / total;
      const entries = [];
      if (r.childrenCount > 0) {
        entries.push({
          vaccineName: r.itemName, doseType: r.doseType,
          vialsUsed: Math.round(r.quantityUsed * childShare), dosesGiven: r.childrenCount,
          dosesWasted: Math.round(r.dosesWasted * childShare), patientType: "child",
        });
      }
      if (r.adultsCount > 0) {
        entries.push({
          vaccineName: r.itemName, doseType: r.doseType,
          vialsUsed: r.quantityUsed - Math.round(r.quantityUsed * childShare), dosesGiven: r.adultsCount,
          dosesWasted: r.dosesWasted - Math.round(r.dosesWasted * childShare), patientType: "adult",
        });
      }
      return entries;
    });

  const wastageByVaccine = summarizeWastageByVaccine([...eomImmunizationLogs, ...routineBhwWastageEntries]);
  const totalChildrenVaccinated = eomImmunizationLogs
    .filter(l => l.patientType === "child")
    .reduce((s, l) => s + (Number(l.dosesGiven) || 0), 0);
  const totalAdultsVaccinated = eomImmunizationLogs
    .filter(l => l.patientType === "adult")
    .reduce((s, l) => s + (Number(l.dosesGiven) || 0), 0);
  const totalDosesGiven = eomImmunizationLogs.reduce((s, l) => s + (Number(l.dosesGiven) || 0), 0);
  const totalDosesWasted = eomImmunizationLogs.reduce((s, l) => s + (Number(l.dosesWasted) || 0), 0);

  // ── FHSIS Report tab ──
  const immunizationCoverage = buildImmunizationCoverageReport(
    [...eomImmunizationLogs, ...routineBhwDosesThisMonth], immunizationLogs, eomMonthKey
  );
  const reportYear = eomMonthKey.split("-")[0];
  const coverageReport = buildCoverageReport(immunizationLogs, barangayPopulation, reportYear, eomMonthKey);

  // Commodity report: Beginning Balance (last month's submitted end balance)
  // + Received this month (inventory items logged/accepted in this month)
  // - Consumed this month (from dispense_logs, already computed as medicineRows)
  // = Ending Balance (prefer this month's own submitted report if it exists,
  // otherwise compute it from the three figures above).
  const receivedByMedicine = {};
  inventory.forEach(item => {
    if (!item.createdAt?.seconds) return;
    const itemMonthKey = new Date(item.createdAt.seconds * 1000).toISOString().slice(0, 7);
    if (itemMonthKey !== eomMonthKey) return;
    receivedByMedicine[item.name] = (receivedByMedicine[item.name] || 0) + (Number(item.quantity) || 0);
  });

  const commodityMedicineNames = new Set([
    ...Object.keys(receivedByMedicine),
    ...medicineRows.map(m => m.medicineName),
    ...(beginningBalanceReport?.items || []).map(it => it.name),
  ]);

  const commodityReport = [...commodityMedicineNames].sort().map(name => {
    const beginningItem = (beginningBalanceReport?.items || []).find(it => it.name === name);
    const currentItem = (thisMonthBalanceReport?.items || []).find(it => it.name === name);
    const beginning = beginningItem ? Number(beginningItem.endBalance) : null;
    const received = receivedByMedicine[name] || 0;
    const consumed = medicineRows.find(m => m.medicineName === name)?.boxes || 0;
    const ending = currentItem
      ? Number(currentItem.endBalance)
      : (beginning !== null ? beginning + received - consumed : null);
    return { name, beginning, received, consumed, ending };
  });

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
                  {item.label === "Notifications" && Boolean(unreadCount) && (
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
                  <h1 className="midwife-page-title">
                    {activeTab === "eom" ? "End-of-Month Report" : activeTab === "fhsis" ? "FHSIS Report" : "Activity Reports"}
                  </h1>
                  <p className="midwife-page-sub">
                    {activeTab === "eom"
                      ? "Patient consumption and immunization/vaccine wastage metrics."
                      : activeTab === "fhsis"
                      ? "DOH-aligned immunization coverage and commodity report."
                      : "Monthly summary of medicine received and dispensed."}
                  </p>
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {activeTab === "activity" ? (
                    <select className="midwife-input" style={{ width: "auto", minWidth: "160px" }}
                      value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                      <option value="all">All Months</option>
                      {months.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  ) : (
                    <select className="midwife-input" style={{ width: "auto", minWidth: "160px" }}
                      value={eomMonthKey} onChange={e => setEomMonthKey(e.target.value)}>
                      {eomMonthOptions.map(mk => <option key={mk} value={mk}>{monthKeyLabel(mk)}</option>)}
                    </select>
                  )}
                  <button className="midwife-btn-primary" onClick={() => window.print()}>
                    Print / Export PDF
                  </button>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
                <button
                  type="button"
                  className={activeTab === "activity" ? "midwife-btn-primary" : "midwife-btn-secondary"}
                  onClick={() => setActiveTab("activity")}
                >
                  Activity Log
                </button>
                <button
                  type="button"
                  className={activeTab === "eom" ? "midwife-btn-primary" : "midwife-btn-secondary"}
                  onClick={() => setActiveTab("eom")}
                >
                  End-of-Month Report
                </button>
                <button
                  type="button"
                  className={activeTab === "fhsis" ? "midwife-btn-primary" : "midwife-btn-secondary"}
                  onClick={() => setActiveTab("fhsis")}
                >
                  FHSIS Report
                </button>
              </div>

              {activeTab === "activity" ? (
              <>

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
              </>
              ) : activeTab === "eom" ? (
                <>
                  <div className="midwife-stats-grid midwife-stats-grid--3">
                    <div className="midwife-stat-card-box">
                      <div className="midwife-stat-icon-box green">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="midwife-stat-label-box">CHILDREN VACCINATED (DOSES)</p>
                        <p className="midwife-stat-value-box">{totalChildrenVaccinated}</p>
                      </div>
                    </div>
                    <div className="midwife-stat-card-box">
                      <div className="midwife-stat-icon-box blue">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="midwife-stat-label-box">ADULTS VACCINATED (DOSES)</p>
                        <p className="midwife-stat-value-box">{totalAdultsVaccinated}</p>
                      </div>
                    </div>
                    <div className="midwife-stat-card-box">
                      <div className="midwife-stat-icon-box purple">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                          <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                        </svg>
                      </div>
                      <div>
                        <p className="midwife-stat-label-box">DOSES WASTED</p>
                        <p className="midwife-stat-value-box" style={{ color: totalDosesWasted > 0 ? "#b91c1c" : undefined }}>{totalDosesWasted}</p>
                      </div>
                    </div>
                  </div>

                  <section className="midwife-section" style={{ marginBottom: "1.5rem" }}>
                    <h2 className="midwife-section-title">Immunization Summary — {monthKeyLabel(eomMonthKey)}</h2>
                    {wastageByVaccine.length === 0 ? (
                      <div className="midwife-empty-state">
                        <h2 className="midwife-empty-title">No Vaccination Sessions for {monthKeyLabel(eomMonthKey)}</h2>
                        <p className="midwife-empty-text">Records will appear here once a vaccination session is logged from Dispense.</p>
                      </div>
                    ) : (
                      <table className="midwife-table">
                        <thead>
                          <tr>
                            <th>VACCINE</th>
                            <th>DOSE TYPE</th>
                            <th>VIALS USED</th>
                            <th>CHILDREN SERVED</th>
                            <th>ADULTS SERVED</th>
                            <th>DOSES GIVEN</th>
                            <th>DOSES WASTED</th>
                            <th>WASTAGE %</th>
                          </tr>
                        </thead>
                        <tbody>
                          {wastageByVaccine.map(v => (
                            <tr key={v.vaccineName}>
                              <td><strong>{v.vaccineName}</strong></td>
                              <td>{v.doseType === "multi" ? "Multi-dose" : "Single-dose"}</td>
                              <td>{v.vialsUsed}</td>
                              <td>{v.childrenServed}</td>
                              <td>{v.adultsServed}</td>
                              <td>{v.dosesGiven}</td>
                              <td style={{ color: v.dosesWasted > 0 ? "#b91c1c" : "#166534" }}>{v.dosesWasted}</td>
                              <td>{v.wastagePercent}%</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>

                  <section className="midwife-section">
                    <h2 className="midwife-section-title">Medicine Dispensing Summary — {monthKeyLabel(eomMonthKey)}</h2>
                    {medicineRows.length === 0 ? (
                      <div className="midwife-empty-state">
                        <h2 className="midwife-empty-title">No Medicine Dispensed for {monthKeyLabel(eomMonthKey)}</h2>
                        <p className="midwife-empty-text">Records will appear here once medicine is dispensed for this month.</p>
                      </div>
                    ) : (
                      <table className="midwife-table">
                        <thead>
                          <tr>
                            <th>MEDICINE</th>
                            <th>DISPENSING EVENTS</th>
                            <th>ADULTS</th>
                            <th>CHILDREN</th>
                            <th>TOTAL BOXES</th>
                            <th>TOTAL TABLETS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {medicineRows.map(m => (
                            <tr key={m.medicineName}>
                              <td><strong>{m.medicineName}</strong></td>
                              <td>{m.events}</td>
                              <td>{m.adults}</td>
                              <td>{m.children}</td>
                              <td>{m.boxes}</td>
                              <td>{m.tablets}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </section>
                </>
              ) : (
                <>
                  <section className="midwife-section" style={{ marginBottom: "1.5rem" }}>
                    <div className="midwife-section-hd">
                      <h2 className="midwife-section-title">Immunization Coverage — {monthKeyLabel(eomMonthKey)}</h2>
                      <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>DOH FHSIS-aligned (EPI schedule)</span>
                    </div>
                    <p className="midwife-input-hint" style={{ marginBottom: "0.75rem" }}>
                      Doses given this month by standard antigen. "Other/Not FHSIS-tracked" vaccines are excluded here but still counted in the End-of-Month Report tab.
                    </p>
                    <div style={{ overflowX: "auto" }}>
                      <table className="midwife-table">
                        <thead>
                          <tr>
                            <th>ANTIGEN</th>
                            {FHSIS_ANTIGEN_ORDER.flatMap(key =>
                              FHSIS_ANTIGENS[key].doseOptions.map(dose => (
                                <th key={`${key}-${dose}`} style={{ whiteSpace: "nowrap" }}>{dose}</th>
                              ))
                            )}
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td><strong>Doses Given</strong></td>
                            {FHSIS_ANTIGEN_ORDER.flatMap(key =>
                              FHSIS_ANTIGENS[key].doseOptions.map(dose => (
                                <td key={`${key}-${dose}-val`}>{immunizationCoverage.coverage[key][dose]}</td>
                              ))
                            )}
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div style={{ marginTop: "1rem", padding: "14px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px" }}>
                      <p style={{ margin: 0, fontWeight: 700, color: "#1a56db", fontSize: "1.1rem" }}>
                        {immunizationCoverage.ficCount} Fully Immunized Child{immunizationCoverage.ficCount !== 1 ? "ren" : ""} this month
                      </p>
                      <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "#1e40af" }}>
                        Completed BCG, Hepatitis B (birth dose), Pentavalent 1–3, OPV 1–3, and MCV1 as of {monthKeyLabel(eomMonthKey)}.
                      </p>
                    </div>
                  </section>

                  <section className="midwife-section" style={{ marginBottom: "1.5rem" }}>
                    <div className="midwife-section-hd">
                      <h2 className="midwife-section-title">Coverage vs. Target Population — {reportYear} (through {monthKeyLabel(eomMonthKey)})</h2>
                      <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>DOH target: {95}%</span>
                    </div>
                    <p className="midwife-input-hint" style={{ marginBottom: "0.75rem" }}>
                      Target population is estimated as {(coverageReport.targetPopulation).toLocaleString()} infants
                      ({barangayPopulation.toLocaleString()} total population × 2.7% estimated birth rate — a standard DOH estimate used when exact birth registry data isn't available). Coverage is cumulative for the year, not just {monthKeyLabel(eomMonthKey)} alone.
                    </p>
                    <div style={{ overflowX: "auto" }}>
                      <table className="midwife-table">
                        <thead>
                          <tr>
                            <th>INDICATOR</th>
                            <th>CHILDREN COVERED (YTD)</th>
                            <th>TARGET POPULATION</th>
                            <th>COVERAGE %</th>
                            <th>STATUS</th>
                          </tr>
                        </thead>
                        <tbody>
                          {coverageReport.rows.map(row => (
                            <tr key={row.key}>
                              <td><strong>{row.label}</strong></td>
                              <td>{row.covered}</td>
                              <td>{row.targetPopulation}</td>
                              <td>{row.percent}%</td>
                              <td>
                                <span style={{
                                  padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 700,
                                  background: row.meetsTarget ? "#d1fae5" : row.percent >= 80 ? "#fef3c7" : "#fee2e2",
                                  color: row.meetsTarget ? "#065f46" : row.percent >= 80 ? "#92400e" : "#991b1b",
                                }}>
                                  {row.meetsTarget ? "Meets Target" : row.percent >= 80 ? "Below Target" : "Low Coverage"}
                                </span>
                              </td>
                            </tr>
                          ))}
                          <tr style={{ background: "#f9fafb" }}>
                            <td><strong>Fully Immunized Child (FIC)</strong></td>
                            <td>{coverageReport.fic.covered}</td>
                            <td>{coverageReport.fic.targetPopulation}</td>
                            <td>{coverageReport.fic.percent}%</td>
                            <td>
                              <span style={{
                                padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 700,
                                background: coverageReport.fic.meetsTarget ? "#d1fae5" : coverageReport.fic.percent >= 80 ? "#fef3c7" : "#fee2e2",
                                color: coverageReport.fic.meetsTarget ? "#065f46" : coverageReport.fic.percent >= 80 ? "#92400e" : "#991b1b",
                              }}>
                                {coverageReport.fic.meetsTarget ? "Meets Target" : coverageReport.fic.percent >= 80 ? "Below Target" : "Low Coverage"}
                              </span>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </section>

                  <section className="midwife-section">
                    <div className="midwife-section-hd">
                      <h2 className="midwife-section-title">Commodity Report — {monthKeyLabel(eomMonthKey)}</h2>
                      <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>DOH logistics-style stock movement</span>
                    </div>
                    {commodityReport.length === 0 ? (
                      <div className="midwife-empty-state">
                        <h2 className="midwife-empty-title">No Commodity Data for {monthKeyLabel(eomMonthKey)}</h2>
                        <p className="midwife-empty-text">This appears once medicine is received or dispensed for this month.</p>
                      </div>
                    ) : (
                      <table className="midwife-table">
                        <thead>
                          <tr>
                            <th>MEDICINE</th>
                            <th>BEGINNING BALANCE</th>
                            <th>RECEIVED</th>
                            <th>CONSUMED</th>
                            <th>ENDING BALANCE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {commodityReport.map(row => (
                            <tr key={row.name}>
                              <td><strong>{row.name}</strong></td>
                              <td>{row.beginning ?? "—"}</td>
                              <td>{row.received}</td>
                              <td>{row.consumed}</td>
                              <td><strong>{row.ending ?? "—"}</strong></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <p className="midwife-input-hint" style={{ marginTop: "0.75rem" }}>
                      Beginning Balance comes from your {monthKeyLabel(monthBefore(eomMonthKey))} Present End Balance submission. A dash means that medicine wasn't reported that month.
                    </p>
                  </section>
                </>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* ════════════════════ PRINT-ONLY VIEW ════════════════════ */}
      <div className="midwife-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          {activeTab === "activity" ? (
            <>
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
            </>
          ) : activeTab === "eom" ? (
            <>
              <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>End-of-Month Report</h1>
              <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>
                Barangay {userData?.barangayName || ""} — {monthKeyLabel(eomMonthKey)}
              </p>

              <h3 style={{ fontSize: "14px" }}>Immunization Summary</h3>
              <p style={{ fontSize: "12px" }}>
                Children vaccinated (doses): {totalChildrenVaccinated} · Adults vaccinated (doses): {totalAdultsVaccinated} · Doses wasted: {totalDosesWasted}
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "20px" }}>
                <thead>
                  <tr>
                    {["Vaccine", "Dose Type", "Vials Used", "Children", "Adults", "Doses Given", "Doses Wasted", "Wastage %"].map(h => (
                      <th key={h} style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {wastageByVaccine.map(v => (
                    <tr key={v.vaccineName}>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{v.vaccineName}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{v.doseType === "multi" ? "Multi-dose" : "Single-dose"}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{v.vialsUsed}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{v.childrenServed}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{v.adultsServed}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{v.dosesGiven}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{v.dosesWasted}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{v.wastagePercent}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <h3 style={{ fontSize: "14px" }}>Medicine Dispensing Summary</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr>
                    {["Medicine", "Events", "Adults", "Children", "Boxes", "Tablets"].map(h => (
                      <th key={h} style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {medicineRows.map(m => (
                    <tr key={m.medicineName}>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{m.medicineName}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{m.events}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{m.adults}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{m.children}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{m.boxes}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{m.tablets}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>FHSIS Report</h1>
              <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>
                Barangay {userData?.barangayName || ""} — {monthKeyLabel(eomMonthKey)}
              </p>

              <h3 style={{ fontSize: "14px" }}>Immunization Coverage (DOH FHSIS-aligned)</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", marginBottom: "12px" }}>
                <thead>
                  <tr>
                    <th style={{ border: "1px solid #999", padding: "5px", textAlign: "left", background: "#eee" }}>Antigen</th>
                    {FHSIS_ANTIGEN_ORDER.flatMap(key =>
                      FHSIS_ANTIGENS[key].doseOptions.map(dose => (
                        <th key={`${key}-${dose}-p`} style={{ border: "1px solid #999", padding: "5px", background: "#eee" }}>{dose}</th>
                      ))
                    )}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ border: "1px solid #999", padding: "5px" }}><strong>Doses Given</strong></td>
                    {FHSIS_ANTIGEN_ORDER.flatMap(key =>
                      FHSIS_ANTIGENS[key].doseOptions.map(dose => (
                        <td key={`${key}-${dose}-pv`} style={{ border: "1px solid #999", padding: "5px" }}>{immunizationCoverage.coverage[key][dose]}</td>
                      ))
                    )}
                  </tr>
                </tbody>
              </table>
              <p style={{ fontSize: "12px", marginBottom: "20px" }}>
                <strong>{immunizationCoverage.ficCount} Fully Immunized Child{immunizationCoverage.ficCount !== 1 ? "ren" : ""}</strong> this month
                (completed BCG, HepB birth dose, Penta 1–3, OPV 1–3, and MCV1).
              </p>

              <h3 style={{ fontSize: "14px" }}>Coverage vs. Target Population — {reportYear} (through {monthKeyLabel(eomMonthKey)})</h3>
              <p style={{ fontSize: "11px", marginBottom: "6px" }}>
                Target population (est.): {coverageReport.targetPopulation} infants ({barangayPopulation} total population × 2.7% estimated birth rate).
              </p>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px", marginBottom: "20px" }}>
                <thead>
                  <tr>
                    {["Indicator", "Covered (YTD)", "Target", "Coverage %", "Status"].map(h => (
                      <th key={h} style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {coverageReport.rows.map(row => (
                    <tr key={row.key}>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.label}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.covered}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.targetPopulation}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.percent}%</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.meetsTarget ? "Meets Target" : row.percent >= 80 ? "Below Target" : "Low Coverage"}</td>
                    </tr>
                  ))}
                  <tr>
                    <td style={{ border: "1px solid #999", padding: "6px" }}><strong>Fully Immunized Child</strong></td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{coverageReport.fic.covered}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{coverageReport.fic.targetPopulation}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{coverageReport.fic.percent}%</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{coverageReport.fic.meetsTarget ? "Meets Target" : coverageReport.fic.percent >= 80 ? "Below Target" : "Low Coverage"}</td>
                  </tr>
                </tbody>
              </table>

              <h3 style={{ fontSize: "14px" }}>Commodity Report</h3>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                <thead>
                  <tr>
                    {["Medicine", "Beginning Balance", "Received", "Consumed", "Ending Balance"].map(h => (
                      <th key={h} style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {commodityReport.map(row => (
                    <tr key={row.name}>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.name}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.beginning ?? "—"}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.received}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.consumed}</td>
                      <td style={{ border: "1px solid #999", padding: "6px" }}>{row.ending ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
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