import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./CHORHUManagement.css";
import "./CHOPopulationReport.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Population Report", to: "/cho/population-report"  },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Notifications",     to: "/cho/notifications"      },
];

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";
const BARANGAYS_COLLECTION = "cho_barangays";
const DEFAULT_RHU_COUNT = 10;

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

export default function CHOPopulationReport() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

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

  function handleLogout() { logout(); navigate("/"); }

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
    <div className="cho-layout">
      <aside className="cho-sidebar no-print">
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
          {navItems.map((item) => (
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
        <header className="cho-topbar no-print">
          <input className="cho-search" type="text" placeholder="Search report metrics..." />
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
                      {rhus.map(rhu => {
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
                      ) : (
                        barangays.map(b => {
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
        </main>
      </div>
    </div>
  );
}