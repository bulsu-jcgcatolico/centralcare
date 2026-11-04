import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, getDocs, query, where,
  doc, getDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import { useToast } from "../../context/ToastContext";
import "./MidwifePatient.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "BHW",           to: "/midwife/bhw"         },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
];

// Compact styling for the per-column filter row under the table header
const FILTER_TH = { padding: "6px 8px", textTransform: "none", background: "#fff", fontWeight: 400 };
const FILTER_INPUT = {
  width: "100%", boxSizing: "border-box", padding: "5px 8px", fontSize: "12px",
  border: "1px solid #d1d5db", borderRadius: "6px", background: "#fff", color: "#111827",
};

export default function MidwifePatients() {
  const { logout, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const unreadMessages = useUnreadMessageCount();

  const [search, setSearch]       = useState("");
  const [activeTab, setActiveTab] = useState("child");
  const [filterBy, setFilterBy]   = useState("all");
  // Per-column filters shown under the table header
  const [colFilters, setColFilters] = useState({});
  const setCol = (key, value) => setColFilters(prev => ({ ...prev, [key]: value }));
  const hasColFilters = Object.values(colFilters).some(v => String(v ?? "").trim() !== "");
  const [patients, setPatients]   = useState([]);
  const [barangayPopulation, setBarangayPopulation] = useState(0);
  const [loading, setLoading]     = useState(false);

  function handleLogout() {
    logout();
    navigate("/");
  }

  useEffect(() => {
    if (userData?.barangayName) {
      loadPatientsAndBarangay();
    }
  }, [userData?.barangayName]);

  async function loadPatientsAndBarangay() {
    setLoading(true);
    try {
      const currentBarangay = userData?.barangayName ?? "";

      const [patSnap, barangaySnap] = await Promise.all([
        getDocs(query(
          collection(db, "patients"),
          where("barangayName", "==", currentBarangay)
        )),
        currentBarangay 
          ? getDoc(doc(db, "cho_barangays", currentBarangay))
          : Promise.resolve(null)
      ]);

      setPatients(patSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      if (barangaySnap && barangaySnap.exists()) {
        const bData = barangaySnap.data();
        if (bData.totalPopulation !== undefined) {
          setBarangayPopulation(bData.totalPopulation);
        }
      }
    } catch (err) {
      console.error("Error loading patient records:", err);
    }
    setLoading(false);
  }

  function handleRegisterPatient() {
    if (activeTab === "child") {
      navigate("/midwife/patients/add/child");
    } else {
      navigate("/midwife/patients/add/adult");
    }
  }

  // Split patients by type
  const childPatients = patients.filter(p => p.type === "child");
  const adultPatients = patients.filter(p => p.type === "adult");

  // Search logic
  const searchFilter = (list) => list.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.patientId?.toLowerCase().includes(search.toLowerCase())
  );

  // Filter dropdown logic
  const applyFilter = (list) => {
    if (filterBy === "all") return list;
    if (filterBy === "male")   return list.filter(p => p.sex?.toLowerCase() === "male" || p.sex?.toLowerCase() === "m");
    if (filterBy === "female") return list.filter(p => p.sex?.toLowerCase() === "female" || p.sex?.toLowerCase() === "f");
    if (filterBy === "complete")   return list.filter(p => p.immunizationStatus === "Complete");
    if (filterBy === "incomplete") return list.filter(p => p.immunizationStatus === "Incomplete");
    return list;
  };

  // Column filters (the row under the table header)
  const norm = (v) => String(v ?? "").trim().toLowerCase();
  const contains = (value, q) => !norm(q) || norm(value).includes(norm(q));
  const sexIs = (p, q) => {
    if (!q) return true;
    const sx = norm(p.sex);
    return q === "male" ? (sx === "male" || sx === "m") : (sx === "female" || sx === "f");
  };
  const applyColumnFilters = (list) => list.filter(p =>
    contains(p.patientId, colFilters.patientId) &&
    contains(p.name, colFilters.name) &&
    (!norm(colFilters.age) || norm(p.age) === norm(colFilters.age)) &&
    sexIs(p, colFilters.sex) &&
    contains(p.birthday, colFilters.birthday) &&
    contains(p.motherName, colFilters.guardian) &&
    contains(p.contact, colFilters.contact) &&
    (!colFilters.status || norm(p.immunizationStatus || "Incomplete") === norm(colFilters.status)) &&
    (!colFilters.civilStatus || norm(p.civilStatus) === norm(colFilters.civilStatus)) &&
    contains(p.lastVisit, colFilters.lastVisit)
  );

  const tabPatients = activeTab === "child" ? childPatients : adultPatients;
  const civilStatusOptions = [...new Set(adultPatients.map(p => (p.civilStatus || "").trim()).filter(Boolean))].sort();

  const displayList = applyColumnFilters(applyFilter(searchFilter(tabPatients)));


  // Print / Export Handler function
  function exportPatients() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      showToast("Please allow popups to export or print patient logs.", "error");
      return;
    }

    const isChild = activeTab === "child";
    const barangay = userData?.barangayName || "Barangay";

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Patient Records (${isChild ? "Children" : "Adults"}) - ${barangay}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; padding: 20px; }
            h2 { margin-bottom: 4px; color: #1a56db; }
            p { color: #555; font-size: 13px; margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 12px; }
            th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; }
            th { background: #f3f4f6; color: #374151; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; }
            tr:nth-child(even) { background: #f9fafb; }
          </style>
        </head>
        <body>
          <h2>CentralCare Health System - Patient Records (${isChild ? "Child Patients" : "Adult Patients"})</h2>
          <p>Barangay: ${barangay} | Filter: ${filterBy.toUpperCase()} | Generated on: ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Patient ID</th>
                <th>Name</th>
                <th>Age</th>
                <th>Sex</th>
                ${isChild ? `
                  <th>Birthday</th>
                  <th>Mother's Name</th>
                  <th>Contact No.</th>
                  <th>Immunization</th>
                ` : `
                  <th>Civil Status</th>
                  <th>Contact No.</th>
                `}
                <th>Last Visit</th>
              </tr>
            </thead>
            <tbody>
              ${displayList.map(patient => `
                <tr>
                  <td>${patient.patientId || "—"}</td>
                  <td><strong>${patient.name || "—"}</strong></td>
                  <td>${patient.age || "—"}</td>
                  <td>${patient.sex || "—"}</td>
                  ${isChild ? `
                    <td>${patient.birthday || "—"}</td>
                    <td>${patient.motherName || "—"}</td>
                    <td>${patient.contact || "—"}</td>
                    <td>${patient.immunizationStatus || "Incomplete"}</td>
                  ` : `
                    <td>${patient.civilStatus || "—"}</td>
                    <td>${patient.contact || "—"}</td>
                  `}
                  <td>${patient.lastVisit || "—"}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }

  return (
    <div className="midwife-layout">
      <style>{`
        /* Even vertical spacing: the content area already spaces its blocks with a flex gap,
           so per-block margins were stacking on top of it and creating dead space. */
        .midwife-layout .midwife-content { gap: 0.875rem; }
        .midwife-layout .midwife-content > * { margin-top: 0; margin-bottom: 0; }
      `}</style>
      {/* Sidebar */}
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
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => "midwife-nav-item" + (isActive ? " active" : "")}
            >
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
        <div className="midwife-sidebar-footer">
          <NavLink to="/midwife/settings" className={({ isActive }) => "midwife-nav-item midwife-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="midwife-main">
        <header className="midwife-topbar">
          <input
            className="midwife-search"
            type="text"
            placeholder="Search patients, medicine, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="midwife-topbar-right">
            <button className="midwife-notif-btn" onClick={() => navigate("/midwife/notifications")} style={{ position: "relative" }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              {Boolean(unreadCount) && (
                <span className="nav-badge" style={{ position: "absolute", top: "-4px", right: "-4px" }}>
                  {unreadCount}
                </span>
              )}
            </button>
            <div className="midwife-user">
              <div className="midwife-user-info">
                <span className="midwife-user-name">Barangay {userData?.barangayName || "Longos"}</span>
                <span className="midwife-user-role">Registered Midwife</span>
              </div>
              <div className="midwife-avatar">
                {`Barangay ${userData?.barangayName || "Longos"}`
                  .split(" ")
                  .map(n => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="midwife-content">
          <div className="midwife-page-header">
            <div>
              <h1 className="midwife-page-title">
                Patient Records for {activeTab === "child" ? "Children" : "Adults"}
              </h1>
              <p className="midwife-page-sub">
                Manage and monitor patient health history and treatments in Barangay {userData?.barangayName || "Longos"}.
              </p>
            </div>
          </div>

          {/* Search & Category Tabs */}
          <div className="midwife-patient-toolbar">
            <input
              className="midwife-search-patient"
              type="text"
              placeholder="Search Patient Name or ID"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="midwife-tab-buttons">
              <button
                className={`midwife-tab-btn ${activeTab === "child" ? "active" : ""}`}
                onClick={() => { setActiveTab("child"); setColFilters({}); }}
              >
                Child
              </button>
              <button
                className={`midwife-tab-btn ${activeTab === "adult" ? "active" : ""}`}
                onClick={() => { setActiveTab("adult"); setColFilters({}); }}
              >
                Adult
              </button>
            </div>
          </div>

          {/* Filter & Actions */}
          <div className="midwife-filter-actions">
            <div className="midwife-filter-dropdown">
              <label>Filter by</label>
              <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
                <option value="all">All Patients</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                {activeTab === "child" && (
                  <>
                    <option value="complete">Complete Immunization</option>
                    <option value="incomplete">Incomplete Immunization</option>
                  </>
                )}
              </select>
            </div>
            <div className="midwife-action-buttons">
              <button className="midwife-btn-primary" onClick={handleRegisterPatient}>
                Register New Patient
              </button>
              <button className="midwife-btn-secondary" onClick={exportPatients}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px', verticalAlign: 'text-bottom' }}>
                  <polyline points="6 9 6 2 18 2 18 9"></polyline>
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                  <rect x="6" y="14" width="12" height="8"></rect>
                </svg>
                Print / Export
              </button>
            </div>
          </div>

          {/* Table Container */}
          {loading ? (
            <div className="midwife-empty-state"><p>Loading records...</p></div>
          ) : tabPatients.length === 0 ? (
            <div className="midwife-empty-state">
              <div className="midwife-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </div>
              <h2 className="midwife-empty-title">
                No {activeTab === "child" ? "Child" : "Adult"} Patient Records Found
              </h2>
              <p className="midwife-empty-text">
                Start by registering your first {activeTab === "child" ? "child" : "adult"} patient for Barangay {userData?.barangayName || "Longos"}.
              </p>
              <button className="midwife-btn-primary" onClick={handleRegisterPatient}>
                Register First Patient
              </button>
            </div>
          ) : (
            <section className="midwife-section">
              <table className="midwife-table">
                <thead>
                  <tr>
                    <th>PATIENT ID</th>
                    {activeTab === "child" ? (
                      <>
                        <th>CHILD NAME</th>
                        <th>AGE</th>
                        <th>SEX</th>
                        <th>BIRTHDAY</th>
                        <th>GUARDIAN (Mother's Name)</th>
                        <th>CONTACT NO.</th>
                        <th>IMMUNIZATION STATUS</th>
                      </>
                    ) : (
                      <>
                        <th>PATIENT NAME</th>
                        <th>AGE</th>
                        <th>SEX</th>
                        <th>CIVIL STATUS</th>
                        <th>CONTACT NO.</th>
                      </>
                    )}
                    <th>LAST VISIT</th>
                    <th>ACTION</th>
                  </tr>
                  <tr className="midwife-col-filter-row">
                    <th style={FILTER_TH}><input style={FILTER_INPUT} placeholder="Filter…" value={colFilters.patientId || ""} onChange={e => setCol("patientId", e.target.value)} /></th>
                    <th style={FILTER_TH}><input style={FILTER_INPUT} placeholder="Filter…" value={colFilters.name || ""} onChange={e => setCol("name", e.target.value)} /></th>
                    <th style={FILTER_TH}><input style={FILTER_INPUT} placeholder="Age" inputMode="numeric" value={colFilters.age || ""} onChange={e => setCol("age", e.target.value)} /></th>
                    <th style={FILTER_TH}>
                      <select style={FILTER_INPUT} value={colFilters.sex || ""} onChange={e => setCol("sex", e.target.value)}>
                        <option value="">All</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </th>
                    {activeTab === "child" ? (
                      <>
                        <th style={FILTER_TH}><input style={FILTER_INPUT} placeholder="e.g. 2025-09" value={colFilters.birthday || ""} onChange={e => setCol("birthday", e.target.value)} /></th>
                        <th style={FILTER_TH}><input style={FILTER_INPUT} placeholder="Filter…" value={colFilters.guardian || ""} onChange={e => setCol("guardian", e.target.value)} /></th>
                        <th style={FILTER_TH}><input style={FILTER_INPUT} placeholder="Filter…" value={colFilters.contact || ""} onChange={e => setCol("contact", e.target.value)} /></th>
                        <th style={FILTER_TH}>
                          <select style={FILTER_INPUT} value={colFilters.status || ""} onChange={e => setCol("status", e.target.value)}>
                            <option value="">All</option>
                            <option value="complete">Complete</option>
                            <option value="incomplete">Incomplete</option>
                          </select>
                        </th>
                      </>
                    ) : (
                      <>
                        <th style={FILTER_TH}>
                          <select style={FILTER_INPUT} value={colFilters.civilStatus || ""} onChange={e => setCol("civilStatus", e.target.value)}>
                            <option value="">All</option>
                            {civilStatusOptions.map(cs => <option key={cs} value={cs}>{cs}</option>)}
                          </select>
                        </th>
                        <th style={FILTER_TH}><input style={FILTER_INPUT} placeholder="Filter…" value={colFilters.contact || ""} onChange={e => setCol("contact", e.target.value)} /></th>
                      </>
                    )}
                    <th style={FILTER_TH}><input style={FILTER_INPUT} placeholder="e.g. 9/29" value={colFilters.lastVisit || ""} onChange={e => setCol("lastVisit", e.target.value)} /></th>
                    <th style={FILTER_TH}>
                      {hasColFilters && (
                        <button type="button" className="midwife-btn-icon" onClick={() => setColFilters({})}>Clear</button>
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {displayList.length === 0 && (
                    <tr>
                      <td colSpan={activeTab === "child" ? 10 : 8} style={{ textAlign: "center", padding: "28px", color: "#6b7280" }}>
                        No patients match the current filters.
                      </td>
                    </tr>
                  )}
                  {displayList.map((patient) => (
                    <tr key={patient.id}>
                      <td>{patient.patientId || "—"}</td>
                      <td><strong>{patient.name || "—"}</strong></td>
                      <td>{patient.age || "—"}</td>
                      <td>{patient.sex || "—"}</td>
                      {activeTab === "child" ? (
                        <>
                          <td>{patient.birthday || "—"}</td>
                          <td>{patient.motherName || "—"}</td>
                          <td>{patient.contact || "—"}</td>
                          <td>
                            <span className={`midwife-status-badge midwife-status--${
                              patient.immunizationStatus?.toLowerCase() === "complete"
                                ? "complete" : "incomplete"
                            }`}>
                              {patient.immunizationStatus || "Incomplete"}
                            </span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{patient.civilStatus || "—"}</td>
                          <td>{patient.contact || "—"}</td>
                        </>
                      )}
                      <td>{patient.lastVisit || "—"}</td>
                      <td>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            className="midwife-btn-icon"
                            onClick={() => navigate(`/midwife/patients/edit/${patient.id}`)}
                          >
                            View/Edit
                          </button>
                        </div>
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
  );
}