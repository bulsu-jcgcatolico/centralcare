import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, getDocs, query, where,
  doc, updateDoc, deleteDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./MidwifePatient.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"      },
  { label: "Patients",      to: "/midwife/patients"       },
  { label: "Inventory",     to: "/midwife/inventory"      },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"        },
  { label: "Notifications", to: "/midwife/notifications"  },
];

export default function MidwifePatients() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [search, setSearch]       = useState("");
  const [activeTab, setActiveTab] = useState("child");
  const [filterBy, setFilterBy]   = useState("all");
  const [patients, setPatients]   = useState([]);
  const [loading, setLoading]     = useState(false);

  const [saving, setSaving] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadPatients(); }, []);

  async function loadPatients() {
    setLoading(true);
    try {
      const q = query(
        collection(db, "patients"),
        where("barangayName", "==", userData?.barangayName ?? "")
      );
      const snap = await getDocs(q);
      setPatients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  function handleRegisterPatient() {
    if (activeTab === "child") {
      navigate("/midwife/patients/add/child");
    } else {
      navigate("/midwife/patients/add/adult");
    }
  }

  async function deletePatient(id) {
    if (!confirm("Delete this patient record?")) return;
    try {
      await deleteDoc(doc(db, "patients", id));
      setPatients(patients.filter(p => p.id !== id));
    } catch (err) { alert("Error: " + err.message); }
  }

  function exportPatients() {
    alert("Export patients - connect to backend for CSV/PDF");
  }

  // Split by type
  const childPatients = patients.filter(p => p.type === "child");
  const adultPatients = patients.filter(p => p.type === "adult");

  // Apply search
  const searchFilter = (list) => list.filter(p =>
    p.name?.toLowerCase().includes(search.toLowerCase()) ||
    p.patientId?.toLowerCase().includes(search.toLowerCase())
  );

  // Apply gender/immunization filter
  const applyFilter = (list) => {
    if (filterBy === "all") return list;
    if (filterBy === "male")   return list.filter(p => p.sex?.toLowerCase() === "male" || p.sex?.toLowerCase() === "m");
    if (filterBy === "female") return list.filter(p => p.sex?.toLowerCase() === "female" || p.sex?.toLowerCase() === "f");
    if (filterBy === "complete")   return list.filter(p => p.immunizationStatus === "Complete");
    if (filterBy === "incomplete") return list.filter(p => p.immunizationStatus === "Incomplete");
    return list;
  };

  const displayList = applyFilter(searchFilter(
    activeTab === "child" ? childPatients : adultPatients
  ));

  const barangayPopulation = 15240;
  const activeCases = patients.filter(p => p.status === "active").length;

  return (
    <div className="midwife-layout">
      {/* ── Sidebar ── */}
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
          <button className="midwife-nav-item midwife-nav-btn">Settings</button>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="midwife-main">
        <header className="midwife-topbar">
          <input className="midwife-search" type="text"
            placeholder="Search patients, medicine, or ID..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
          <div className="midwife-topbar-right">
            <button className="midwife-notif-btn">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </button>
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
                Patient Records for {activeTab === "child" ? "Children" : "Adults"}
              </h1>
              <p className="midwife-page-sub">
                Manage and monitor patient health history and treatments.
              </p>
            </div>
          </div>

          {/* Stats */}
          <div className="midwife-stats-grid midwife-stats-grid--4">
            <div className="midwife-stat-card-box">
              <div className="midwife-stat-icon-box blue">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-stat-label-box">Total Population</p>
                <p className="midwife-stat-value-box">{barangayPopulation.toLocaleString()}</p>
              </div>
            </div>
            <div className="midwife-stat-card-box">
              <div className="midwife-stat-icon-box green">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                  <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm2 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-stat-label-box">Active Cases</p>
                <p className="midwife-stat-value-box">{activeCases}</p>
              </div>
            </div>
            <div className="midwife-stat-card-box">
              <div className="midwife-stat-icon-box orange">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                  <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-stat-label-box">Child Patients</p>
                <p className="midwife-stat-value-box">{childPatients.length}</p>
              </div>
            </div>
            <div className="midwife-stat-card-box">
              <div className="midwife-stat-icon-box purple">
                <svg viewBox="0 0 24 24" fill="currentColor" width="22" height="22">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-stat-label-box">Adult Patients</p>
                <p className="midwife-stat-value-box">{adultPatients.length}</p>
              </div>
            </div>
          </div>

          {/* Search & Tabs */}
          <div className="midwife-patient-toolbar">
            <input className="midwife-search-patient" type="text"
              placeholder="Search Patient"
              value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="midwife-tab-buttons">
              <button
                className={`midwife-tab-btn ${activeTab === "child" ? "active" : ""}`}
                onClick={() => setActiveTab("child")}>Child</button>
              <button
                className={`midwife-tab-btn ${activeTab === "adult" ? "active" : ""}`}
                onClick={() => setActiveTab("adult")}>Adult</button>
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
                Export
              </button>
            </div>
          </div>

          {/* Table or Empty State */}
          {loading ? (
            <div className="midwife-empty-state"><p>Loading patients...</p></div>
          ) : displayList.length === 0 ? (
            <div className="midwife-empty-state">
              <div className="midwife-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                </svg>
              </div>
              <h2 className="midwife-empty-title">
                No {activeTab === "child" ? "Child" : "Adult"} Patient Records Yet
              </h2>
              <p className="midwife-empty-text">
                Start by registering your first {activeTab === "child" ? "child" : "adult"} patient.
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
                </thead>
                <tbody>
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
                          <button className="midwife-btn-icon"
                            onClick={() => navigate(`/midwife/patients/edit/${patient.id}`)}>
                            Edit
                          </button>
                          <button className="midwife-btn-icon midwife-btn-icon--danger"
                            onClick={() => deletePatient(patient.id)}>
                            Delete
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