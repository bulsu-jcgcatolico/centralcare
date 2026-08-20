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
  { label: "Messages",      to: "/midwife/messages"      },
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

  // Multi-medicine dispensing rows state
  const [dispenseItems, setDispenseItems] = useState([
    { id: Date.now(), itemId: "", boxes: "" }
  ]);

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
      setRecentLogs(logs); 
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
    setDispenseItems([{ id: Date.now(), itemId: "", boxes: "" }]);
    setDiagnosis("");
    setNotes("");
    setDispensedBy("");
  }

  // Row management handlers
  function handleAddMedicineRow() {
    setDispenseItems(prev => [...prev, { id: Date.now(), itemId: "", boxes: "" }]);
  }

  function handleRemoveMedicineRow(rowId) {
    if (dispenseItems.length === 1) {
      setDispenseItems([{ id: Date.now(), itemId: "", boxes: "" }]);
      return;
    }
    setDispenseItems(prev => prev.filter(item => item.id !== rowId));
  }

  function handleRowChange(rowId, field, value) {
    setDispenseItems(prev => prev.map(item => {
      if (item.id === rowId) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  }

  async function saveDispense() {
    if (!selectedPatient) { alert("Please search and select a patient first."); return; }
    if (dispenseItems.length === 0) { alert("Please add at least one medicine to dispense."); return; }

    // Validate all rows before saving
    for (const row of dispenseItems) {
      if (!row.itemId) { alert("Please select a medicine for all rows."); return; }
      const boxes = parseInt(row.boxes);
      if (!boxes || boxes <= 0) { alert("Please enter a valid number of boxes for all selected medicines."); return; }

      const invItem = inventory.find(i => i.id === row.itemId);
      const available = invItem ? (invItem.remaining ?? invItem.quantity ?? 0) : 0;
      if (boxes > available) {
        alert(`Only ${available} boxes of ${invItem?.name || 'selected medicine'} remaining!`);
        return;
      }
    }

    setSaving(true);
    try {
      const batchTimestamp = serverTimestamp();
      const formattedDate = new Date().toLocaleDateString();

      // Process each medicine item sequentially or in parallel
      for (const row of dispenseItems) {
        const invItem = inventory.find(i => i.id === row.itemId);
        const available = invItem ? (invItem.remaining ?? invItem.quantity ?? 0) : 0;
        const boxes = parseInt(row.boxes);
        const newRemaining = available - boxes;

        // Update Inventory stock
        await updateDoc(doc(db, "inventory", invItem.id), { remaining: newRemaining });
        await checkAndNotifyLowStock(
          { id: invItem.id, name: invItem.name, remaining: newRemaining },
          "midwife",
          userData
        );

        // Record Dispense Log entry
        await addDoc(collection(db, "dispense_logs"), {
          barangayName:     userData?.barangayName ?? "",
          patientId:        selectedPatient.id,
          patientName:      selectedPatient.name,
          patientRecordId:  selectedPatient.patientId ?? "",
          medicineName:     invItem.name,
          lotNumber:        invItem.lotNumber ?? "",
          boxesDispensed:   boxes,
          tabletsDispensed: boxes * TABLETS_PER_BOX,
          diagnosis:        diagnosis.trim(),
          notes:            notes.trim(),
          dispensedBy:      dispensedBy.trim(),
          dispensedAt:      batchTimestamp,
          date:             formattedDate
        });
      }

      alert(`Successfully dispensed medicines to ${selectedPatient.name}.`);
      resetForm();
      loadData();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  // Print / Export Handler function
  function handlePrintExport() {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to export or print dispense logs.");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Dispense Logs - ${userData?.barangayName || "Barangay"}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #111; padding: 20px; }
            h2 { margin-bottom: 4px; color: #1a56db; }
            p { color: #555; font-size: 13px; margin-top: 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 13px; }
            th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
            th { background: #f3f4f6; color: #374151; }
            tr:nth-child(even) { background: #f9fafb; }
          </style>
        </head>
        <body>
          <h2>CentralCare Health System - Dispense Logs</h2>
          <p>Barangay: ${userData?.barangayName || "N/A"} | Generated on: ${new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Patient Name</th>
                <th>Medicine Dispensed</th>
                <th>Boxes / Tablets</th>
                <th>Diagnosis</th>
                <th>Dispensed By</th>
              </tr>
            </thead>
            <tbody>
              ${recentLogs.map(log => `
                <tr>
                  <td>${log.date || "N/A"}</td>
                  <td>${log.patientName || "N/A"}</td>
                  <td>${log.medicineName || "N/A"}</td>
                  <td>${log.boxesDispensed} box(es) (${log.tabletsDispensed || (log.boxesDispensed * TABLETS_PER_BOX)} tabs)</td>
                  <td>${log.diagnosis || "-"}</td>
                  <td>${log.dispensedBy || "-"}</td>
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
            placeholder="Search patients, medicine, or ID..." 
            aria-label="Search" 
            value={patientSearch}
            onChange={e => setPatientSearch(e.target.value)}
          />
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
              <p className="midwife-page-sub">Search a patient, select multiple medicines, and record what was dispensed.</p>
            </div>
          </div>

          <div className="dispense-grid">
            {/* ── Left: Form ── */}
            <section className="midwife-section">
              <div className="midwife-section-header-block">
                <span className="midwife-step-badge">1</span>
                <h2 className="midwife-section-title">Find Patient</h2>
              </div>

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

              <div className="midwife-section-header-block" style={{ marginTop: "1.75rem" }}>
                <span className="midwife-step-badge">2</span>
                <h2 className="midwife-section-title">Select Medicine(s)</h2>
              </div>

              {/* Multi-medicine rows container */}
              <div className="dispense-medicine-rows-container">
                {dispenseItems.map((row, index) => {
                  const currentItem = inventory.find(i => i.id === row.itemId);
                  const availableStock = currentItem ? (currentItem.remaining ?? currentItem.quantity ?? 0) : 0;

                  return (
                    <div key={row.id} className="dispense-medicine-row-card">
                      <div className="dispense-medicine-row-top">
                        <span className="dispense-row-number">Medicine #{index + 1}</span>
                        {dispenseItems.length > 1 && (
                          <button 
                            type="button" 
                            className="dispense-row-remove-btn" 
                            onClick={() => handleRemoveMedicineRow(row.id)}
                            title="Remove medicine"
                          >
                            Remove
                          </button>
                        )}
                      </div>

                      <div className="midwife-form-field">
                        <label className="midwife-label">Medicine <span className="midwife-required">*</span></label>
                        <select 
                          className="midwife-input" 
                          value={row.itemId} 
                          onChange={e => handleRowChange(row.id, "itemId", e.target.value)}
                        >
                          <option value="">-- Select Medicine --</option>
                          {inventory.filter(i => (i.remaining ?? i.quantity ?? 0) > 0).map(item => (
                            <option key={item.id} value={item.id}>
                              {item.name}{item.lotNumber ? ` (Lot ${item.lotNumber})` : ""} — {item.remaining ?? item.quantity ?? 0} boxes remaining
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="midwife-form-field" style={{ marginBottom: 0 }}>
                        <label className="midwife-label">Boxes to Dispense (30's) <span className="midwife-required">*</span></label>
                        <input 
                          className="midwife-input" 
                          type="number" 
                          min="1"
                          placeholder={currentItem ? `Max: ${availableStock} boxes` : "Select medicine first"}
                          value={row.boxes} 
                          onChange={e => handleRowChange(row.id, "boxes", e.target.value)} 
                        />
                        {row.boxes && currentItem && (
                          <p className="midwife-input-hint">
                            = {parseInt(row.boxes || 0) * TABLETS_PER_BOX} tablets dispensed.
                            Remaining after: {availableStock - parseInt(row.boxes || 0)} boxes
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}

                <button 
                  type="button" 
                  className="midwife-btn-secondary dispense-add-row-btn" 
                  onClick={handleAddMedicineRow}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}>
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  Add Another Medicine
                </button>
              </div>

              <div className="midwife-section-header-block" style={{ marginTop: "1.75rem" }}>
                <span className="midwife-step-badge">3</span>
                <h2 className="midwife-section-title">Additional Info</h2>
              </div>
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

            {/* ── Right: Recent History with Print/Export ── */}
            <section className="midwife-section">
              <div className="dispense-history-header">
                <div>
                  <h2 className="midwife-section-title" style={{ margin: 0 }}>Recent Dispense Log</h2>
                  <p className="midwife-history-sub">Latest medicine transactions</p>
                </div>
                <button 
                  className="midwife-btn-secondary dispense-export-btn" 
                  onClick={handlePrintExport}
                  title="Print or Export Logs"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px', verticalAlign: 'text-bottom' }}>
                    <polyline points="6 9 6 2 18 2 18 9"></polyline>
                    <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
                    <rect x="6" y="14" width="12" height="8"></rect>
                  </svg>
                  Print / Export
                </button>
              </div>

              {loading ? (
                <p className="midwife-input-hint">Loading...</p>
              ) : recentLogs.length === 0 ? (
                <p className="midwife-input-hint">No dispensing recorded yet.</p>
              ) : (
                <div className="dispense-log-list">
                  {recentLogs.slice(0, 8).map(log => (
                    <div className="dispense-log-row" key={log.id}>
                      <div>
                        <p className="dispense-log-med">{log.medicineName}</p>
                        <p className="dispense-log-sub">
                          {log.patientName} · <span className="dispense-badge-pill">{log.boxesDispensed} box{log.boxesDispensed !== 1 ? "es" : ""}</span>
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