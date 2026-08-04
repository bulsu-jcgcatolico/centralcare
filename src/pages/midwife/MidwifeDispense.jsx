import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, query, where, doc, updateDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { checkAndNotifyLowStock } from "../../utils/lowStockNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./MidwifeDispense.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Notifications", to: "/midwife/notifications" },
];

const TABLETS_PER_BOX = 30;

export default function MidwifeDispense() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [patients, setPatients]     = useState([]);
  const [inventory, setInventory]   = useState([]);
  const [recentLogs, setRecentLogs] = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);

  // Patient search + selection
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState(null);

  // Medicine + dispensing details
  const [selectedItemId, setSelectedItemId] = useState("");
  const [boxesToDispense, setBoxesToDispense] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [dispensedBy, setDispensedBy] = useState("");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [patSnap, invSnap, logSnap] = await Promise.all([
        getDocs(query(collection(db, "patients"),
          where("barangayName", "==", userData?.barangayName ?? ""))),
        getDocs(query(collection(db, "inventory"),
          where("ownerType", "==", "midwife"),
          where("barangayName", "==", userData?.barangayName ?? ""))),
        getDocs(query(collection(db, "dispense_logs"),
          where("barangayName", "==", userData?.barangayName ?? "")))
      ]);
      setPatients(patSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      const logs = logSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      logs.sort((a, b) => (b.dispensedAt?.seconds ?? 0) - (a.dispensedAt?.seconds ?? 0));
      setRecentLogs(logs.slice(0, 8));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const matchingPatients = patientSearch.trim().length === 0 ? [] : patients.filter(p =>
    p.name?.toLowerCase().includes(patientSearch.toLowerCase()) ||
    p.patientId?.toLowerCase().includes(patientSearch.toLowerCase())
  );

  function selectPatient(p) {
    setSelectedPatient(p);
    setPatientSearch("");
  }

  function resetForm() {
    setSelectedPatient(null);
    setPatientSearch("");
    setSelectedItemId("");
    setBoxesToDispense("");
    setDiagnosis("");
    setNotes("");
    setDispensedBy("");
  }

  const selectedItem = inventory.find(i => i.id === selectedItemId);

  async function saveDispense() {
    if (!selectedPatient) { alert("Please search and select a patient first."); return; }
    if (!selectedItem) { alert("Please select a medicine to dispense."); return; }
    const boxes = parseInt(boxesToDispense);
    if (!boxes || boxes <= 0) { alert("Please enter a valid number of boxes."); return; }
    if (boxes > (selectedItem.remaining ?? 0)) {
      alert(`Only ${selectedItem.remaining} boxes of ${selectedItem.name} remaining!`);
      return;
    }

    setSaving(true);
    try {
      const newRemaining = (selectedItem.remaining ?? 0) - boxes;
      await updateDoc(doc(db, "inventory", selectedItem.id), { remaining: newRemaining });
      await checkAndNotifyLowStock(
        { id: selectedItem.id, name: selectedItem.name, remaining: newRemaining },
        "midwife",
        userData
      );

      await addDoc(collection(db, "dispense_logs"), {
        barangayName:     userData?.barangayName ?? "",
        patientId:        selectedPatient.id,
        patientName:      selectedPatient.name,
        patientRecordId:  selectedPatient.patientId ?? "",
        medicineName:     selectedItem.name,
        lotNumber:        selectedItem.lotNumber ?? "",
        boxesDispensed:   boxes,
        tabletsDispensed: boxes * TABLETS_PER_BOX,
        diagnosis:        diagnosis.trim(),
        notes:            notes.trim(),
        dispensedBy:      dispensedBy.trim(),
        dispensedAt:      serverTimestamp(),
        date:             new Date().toLocaleDateString()
      });

      alert(`Dispensed ${boxes} box(es) (${boxes * TABLETS_PER_BOX} tablets) of ${selectedItem.name} to ${selectedPatient.name}.`);
      resetForm();
      loadData();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  return (
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
          <button className="midwife-nav-item midwife-nav-btn">Settings</button>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="midwife-main">
        <header className="midwife-topbar">
          <input className="midwife-search" type="text"
            placeholder="Search patients, medicine, or ID..." aria-label="Search" />
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
              <h1 className="midwife-page-title">Dispense Medicine</h1>
              <p className="midwife-page-sub">Search a patient, select medicine, and record what was dispensed.</p>
            </div>
          </div>

          <div className="dispense-grid">
            {/* ── Left: Form ── */}
            <section className="midwife-section">
              <h2 className="midwife-section-title">1. Find Patient</h2>

              {selectedPatient ? (
                <div className="dispense-selected-patient">
                  <div>
                    <p className="dispense-selected-name">{selectedPatient.name}</p>
                    <p className="dispense-selected-sub">
                      {selectedPatient.patientId || "No ID"} · {selectedPatient.type === "child" ? "Child" : "Adult"}
                      {selectedPatient.age ? ` · ${selectedPatient.age} yrs old` : ""}
                      {selectedPatient.sex ? ` · ${selectedPatient.sex}` : ""}
                    </p>
                  </div>
                  <button type="button" className="midwife-btn-secondary" onClick={() => setSelectedPatient(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <input
                    className="midwife-input dispense-patient-search"
                    type="text"
                    placeholder="Type patient name or Patient ID..."
                    value={patientSearch}
                    onChange={e => setPatientSearch(e.target.value)}
                  />
                  {patientSearch.trim() && (
                    matchingPatients.length === 0 ? (
                      <p className="midwife-input-hint">No matching patients found in your barangay records.</p>
                    ) : (
                      <div className="dispense-patient-results">
                        {matchingPatients.slice(0, 6).map(p => (
                          <button type="button" key={p.id} className="dispense-patient-result-row" onClick={() => selectPatient(p)}>
                            <span className="dispense-result-name">{p.name}</span>
                            <span className="dispense-result-sub">
                              {p.patientId || "No ID"} · {p.type === "child" ? "Child" : "Adult"}
                              {p.age ? ` · ${p.age} yrs old` : ""}
                            </span>
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}

              <h2 className="midwife-section-title" style={{ marginTop: "1.75rem" }}>2. Select Medicine</h2>
              <div className="midwife-form-field">
                <label className="midwife-label">Medicine <span className="midwife-required">*</span></label>
                <select className="midwife-input" value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}>
                  <option value="">-- Select Medicine --</option>
                  {inventory.filter(i => (i.remaining ?? 0) > 0).map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name}{item.lotNumber ? ` (Lot ${item.lotNumber})` : ""} — {item.remaining} boxes remaining
                    </option>
                  ))}
                </select>
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Boxes to Dispense (30's) <span className="midwife-required">*</span></label>
                <input className="midwife-input" type="number" min="1"
                  placeholder={selectedItem ? `Max: ${selectedItem.remaining} boxes` : "Select medicine first"}
                  value={boxesToDispense} onChange={e => setBoxesToDispense(e.target.value)} />
                {boxesToDispense && selectedItem && (
                  <p className="midwife-input-hint">
                    = {parseInt(boxesToDispense || 0) * TABLETS_PER_BOX} tablets dispensed.
                    Remaining after: {selectedItem.remaining - parseInt(boxesToDispense || 0)} boxes
                  </p>
                )}
              </div>

              <h2 className="midwife-section-title" style={{ marginTop: "1.75rem" }}>3. Additional Info</h2>
              <div className="midwife-form-row">
                <div className="midwife-form-field">
                  <label className="midwife-label">Diagnosis / Reason</label>
                  <input className="midwife-input" type="text"
                    placeholder="e.g., Upper Respiratory Tract Infection"
                    value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
                </div>
                <div className="midwife-form-field">
                  <label className="midwife-label">Dispensed By</label>
                  <input className="midwife-input" type="text"
                    placeholder="e.g., Midwife Maria Santos"
                    value={dispensedBy} onChange={e => setDispensedBy(e.target.value)} />
                </div>
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Notes</label>
                <textarea className="midwife-input dispense-notes" rows="3"
                  placeholder="Any additional notes (optional)"
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              <div className="dispense-submit-row">
                <button className="midwife-btn-secondary" onClick={resetForm}>Clear</button>
                <button className="midwife-btn-primary" onClick={saveDispense} disabled={saving}>
                  {saving ? "Dispensing..." : "Confirm Dispense"}
                </button>
              </div>
            </section>

            {/* ── Right: Recent History ── */}
            <section className="midwife-section">
              <h2 className="midwife-section-title">Recent Dispense Log</h2>
              {loading ? (
                <p className="midwife-input-hint">Loading...</p>
              ) : recentLogs.length === 0 ? (
                <p className="midwife-input-hint">No dispensing recorded yet.</p>
              ) : (
                <div className="dispense-log-list">
                  {recentLogs.map(log => (
                    <div className="dispense-log-row" key={log.id}>
                      <div>
                        <p className="dispense-log-med">{log.medicineName}</p>
                        <p className="dispense-log-sub">
                          {log.patientName} · {log.boxesDispensed} box{log.boxesDispensed !== 1 ? "es" : ""}
                          {log.diagnosis ? ` · ${log.diagnosis}` : ""}
                        </p>
                      </div>
                      <span className="dispense-log-date">{log.date}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}