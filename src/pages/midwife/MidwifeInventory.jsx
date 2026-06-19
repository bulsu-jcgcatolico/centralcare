import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, doc,
  serverTimestamp, query, where, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { checkAndNotifyLowStock } from "../../utils/lowStockNotifier";
import "./MidwifeInventory.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Notifications", to: "/midwife/notifications" },
];

const TABLETS_PER_BOX = 30;

function generateProductKey() {
  return Math.floor(10000 + Math.random() * 89999).toString();
}

function getStatus(remaining) {
  if (remaining <= 20) return "Critical";
  if (remaining <= 50) return "Low";
  return "Good";
}
function getStatusClass(remaining) {
  if (remaining <= 20) return "midwife-status--critical";
  if (remaining <= 50) return "midwife-status--low";
  return "midwife-status--good";
}

export default function MidwifeInventory() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();


  const [inventory, setInventory]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState("");

  // Log New Shipment modal
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shipProductName, setShipProductName]     = useState("");
  const [shipCategory, setShipCategory]           = useState("General Consumption");
  const [shipSubCategory, setShipSubCategory]     = useState("");
  const [shipBoxes, setShipBoxes]                 = useState("");
  const [shipExpiry, setShipExpiry]               = useState("");
  const [shipSource, setShipSource]               = useState("");

  // Dispense modal
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [dispenseItem, setDispenseItem]           = useState(null);
  const [patientName, setPatientName]             = useState("");
  const [boxesToDispense, setBoxesToDispense]     = useState("");
  const [diagnosis, setDiagnosis]                 = useState("");
  const [dispensing, setDispensing]               = useState(false);



  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadInventory(); }, []);

  async function loadInventory() {
    setLoading(true);
    try {
      const q = query(
        collection(db, "inventory"),
        where("ownerType", "==", "midwife"),
        where("barangayName", "==", userData?.barangayName ?? "")
      );
      const snap = await getDocs(q);
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  // ── Log new shipment ────────────────────────────────────────────────────────
  async function saveShipment() {
    if (!shipProductName.trim() || !shipBoxes || !shipExpiry) {
      alert("Please fill in Product Name, Boxes, and Expiry Date");
      return;
    }
    setSaving(true);
    try {
      const boxes = parseInt(shipBoxes);
      await addDoc(collection(db, "inventory"), {
        productKey:    generateProductKey(),
        name:          shipProductName.trim(),
        category:      shipCategory,
        subCategory:   shipSubCategory.trim(),
        quantity:      boxes,
        remaining:     boxes,
        expiry:        shipExpiry,
        source:        shipSource,
        ownerType:     "midwife",
        barangayName:  userData?.barangayName ?? "",
        createdAt:     serverTimestamp(),
      });
      alert("Shipment logged successfully!");
      setShipProductName(""); setShipCategory("General Consumption");
      setShipSubCategory(""); setShipBoxes(""); setShipExpiry(""); setShipSource("");
      setShowShipmentModal(false);
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  // ── Dispense items ──────────────────────────────────────────────────────────
  function openDispense(item) {
    setDispenseItem(item);
    setPatientName(""); setBoxesToDispense(""); setDiagnosis("");
    setShowDispenseModal(true);
  }

  async function saveDispense() {
    const boxes = parseInt(boxesToDispense);
    if (!patientName.trim()) { alert("Please enter patient name"); return; }
    if (!boxes || boxes <= 0) { alert("Please enter boxes to dispense"); return; }
    if (boxes > dispenseItem.remaining) {
      alert(`Only ${dispenseItem.remaining} boxes remaining!`); return;
    }
    setDispensing(true);
    try {
      const newRemaining = dispenseItem.remaining - boxes;
      await updateDoc(doc(db, "inventory", dispenseItem.id), { remaining: newRemaining });
      await checkAndNotifyLowStock({ id: dispenseItem.id, name: dispenseItem.name, remaining: newRemaining }, "midwife", userData);

      await addDoc(collection(db, "dispense_logs"), {
        barangayName:    userData?.barangayName ?? "",
        medicineName:    dispenseItem.name,
        patientName:     patientName.trim(),
        boxesDispensed:  boxes,
        tabletsDispensed: boxes * TABLETS_PER_BOX,
        diagnosis:       diagnosis.trim(),
        dispensedAt:     serverTimestamp(),
        date:            new Date().toLocaleDateString()
      });

      alert(`Dispensed ${boxes} box(es) (${boxes * TABLETS_PER_BOX} tablets) of ${dispenseItem.name} to ${patientName}.`);
      setShowDispenseModal(false);
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setDispensing(false);
  }

  const filtered = inventory.filter(i =>
    i.name?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount   = inventory.filter(i => (i.remaining ?? 0) <= 50 && (i.remaining ?? 0) > 20).length;
  const criticalCount   = inventory.filter(i => (i.remaining ?? 0) <= 20).length;
  const expiringCount   = inventory.filter(i => {
    if (!i.expiry) return false;
    const days = (new Date(i.expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= 30 && days >= 0;
  }).length;

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
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "midwife-nav-item" + (isActive ? " active" : "")}>
              {item.label}
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
              <h1 className="midwife-page-title">Local Inventory</h1>
              <p className="midwife-page-sub">
                Monitor available medicines and medical supplies at the Barangay Health Center.
              </p>
            </div>
          </div>

          {/* Stats — 3 cards */}
          <div className="midwife-inv-stats-row">
            <div className="midwife-inv-stat-card">
              <div className="midwife-inv-stat-icon midwife-inv-icon--blue">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-inv-stat-label">Total Items</p>
                <p className="midwife-inv-stat-value">{inventory.length}</p>
              </div>
            </div>
            <div className="midwife-inv-stat-card">
              <div className="midwife-inv-stat-icon midwife-inv-icon--orange">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-inv-stat-label">Low Stock</p>
                <p className="midwife-inv-stat-value">{lowStockCount}</p>
              </div>
            </div>
            <div className="midwife-inv-stat-card">
              <div className="midwife-inv-stat-icon midwife-inv-icon--red">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-inv-stat-label">Expiring Soon</p>
                <p className="midwife-inv-stat-value">{expiringCount}</p>
              </div>
            </div>
          </div>

          {/* Toolbar */}
          <div className="midwife-inv-toolbar">
            <div className="midwife-inv-search-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                width="16" height="16" className="midwife-inv-search-icon">
                <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
              </svg>
              <input
                className="midwife-search-med"
                type="text"
                placeholder="Search Medicine"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div className="midwife-inv-toolbar-right">
              <button className="midwife-btn-primary" onClick={() => setShowDispenseModal(true)}>
                Dispense Items
              </button>
              <button className="midwife-btn-primary midwife-btn--outline" onClick={() => navigate("/midwife/request-letter")}>
                Request Supplies
              </button>
              <button className="midwife-btn-secondary" onClick={() => setShowShipmentModal(true)}>
                Log New Shipment
              </button>
              <button className="midwife-btn-secondary" onClick={() => alert("Export to CSV")}>
                Export
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="midwife-empty-state"><p>Loading inventory...</p></div>
          ) : filtered.length === 0 ? (
            <div className="midwife-empty-state">
              <div className="midwife-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <h2 className="midwife-empty-title">No Inventory Items Yet</h2>
              <p className="midwife-empty-text">
                Log a new shipment or wait for your RHU to distribute supplies.
              </p>
              <button className="midwife-btn-primary" onClick={() => setShowShipmentModal(true)}>
                Log New Shipment
              </button>
            </div>
          ) : (
            <section className="midwife-inv-section">
              <table className="midwife-table">
                <thead>
                  <tr>
                    <th>PRODUCT KEY</th>
                    <th>PRODUCT NAME</th>
                    <th>CATEGORY</th>
                    <th>SUB-CATEGORY</th>
                    <th>QUANTITY</th>
                    <th>REMAINING</th>
                    <th>EXPIRY</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const remaining = item.remaining ?? item.quantity;
                    return (
                      <tr key={item.id}>
                        <td className="midwife-product-key">{item.productKey || "—"}</td>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.category}</td>
                        <td>
                          {item.subCategory
                            ? <span className="midwife-subcategory-pill">{item.subCategory}</span>
                            : "—"}
                        </td>
                        <td>{item.quantity} boxes(30's)</td>
                        <td><strong>{remaining} boxes(30's)</strong></td>
                        <td>{item.expiry}</td>
                        <td>
                          <span className={`midwife-status-badge ${getStatusClass(remaining)}`}>
                            <span className={`midwife-status-dot midwife-dot--${getStatus(remaining).toLowerCase()}`} />
                            {getStatus(remaining)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}
        </main>
      </div>

      {/* ── Log New Shipment Modal ── */}
      {showShipmentModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowShipmentModal(false)}>
          <div className="midwife-modal" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">Log New Shipment</h2>
              <button className="midwife-modal-close" onClick={() => setShowShipmentModal(false)}>x</button>
            </div>
            <div className="midwife-modal-body">
              <div className="midwife-form-field">
                <label className="midwife-label">Product Name *</label>
                <input className="midwife-input" type="text" placeholder="e.g., Amoxicillin 500mg Tablet"
                  value={shipProductName} onChange={e => setShipProductName(e.target.value)} />
              </div>
              <div className="midwife-form-row">
                <div className="midwife-form-field">
                  <label className="midwife-label">Category</label>
                  <select className="midwife-input" value={shipCategory} onChange={e => setShipCategory(e.target.value)}>
                    <option>General Consumption</option>
                    <option>Non-Consumption</option>
                  </select>
                </div>
                <div className="midwife-form-field">
                  <label className="midwife-label">Sub-Category</label>
                  <input className="midwife-input" type="text" placeholder="e.g., Antibiotic"
                    value={shipSubCategory} onChange={e => setShipSubCategory(e.target.value)} />
                </div>
              </div>
              <div className="midwife-form-row">
                <div className="midwife-form-field">
                  <label className="midwife-label">Boxes Received (30's) *</label>
                  <input className="midwife-input" type="number" placeholder="0"
                    value={shipBoxes} onChange={e => setShipBoxes(e.target.value)} />
                </div>
                <div className="midwife-form-field">
                  <label className="midwife-label">Source</label>
                  <select className="midwife-input" value={shipSource} onChange={e => setShipSource(e.target.value)}>
                    <option value="">Select Source</option>
                    <option value="RHU">From RHU</option>
                    <option value="DOH">DOH</option>
                    <option value="LGU">LGU</option>
                  </select>
                </div>
                <div className="midwife-form-field">
                  <label className="midwife-label">Expiry Date *</label>
                  <input className="midwife-input" type="date"
                    value={shipExpiry} onChange={e => setShipExpiry(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="midwife-modal-footer">
              <button className="midwife-btn-secondary" onClick={() => setShowShipmentModal(false)}>Cancel</button>
              <button className="midwife-btn-primary" onClick={saveShipment} disabled={saving}>
                {saving ? "Saving..." : "Save Shipment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Dispense Modal ── */}
      {showDispenseModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowDispenseModal(false)}>
          <div className="midwife-modal" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">Dispense Items</h2>
              <button className="midwife-modal-close" onClick={() => setShowDispenseModal(false)}>x</button>
            </div>
            <div className="midwife-modal-body">
              <div className="midwife-form-field">
                <label className="midwife-label">Select Medicine *</label>
                <select className="midwife-input" value={dispenseItem?.id || ""}
                  onChange={e => {
                    const found = inventory.find(i => i.id === e.target.value);
                    setDispenseItem(found || null);
                  }}>
                  <option value="">-- Select Medicine --</option>
                  {inventory.filter(i => (i.remaining ?? 0) > 0).map(item => (
                    <option key={item.id} value={item.id}>
                      {item.name} — {item.remaining} boxes remaining
                    </option>
                  ))}
                </select>
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Patient Name *</label>
                <input className="midwife-input" type="text" placeholder="Enter patient full name"
                  value={patientName} onChange={e => setPatientName(e.target.value)} />
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Boxes to Dispense (30's) *</label>
                <input className="midwife-input" type="number" min="1"
                  placeholder={dispenseItem ? `Max: ${dispenseItem.remaining} boxes` : "Select medicine first"}
                  value={boxesToDispense} onChange={e => setBoxesToDispense(e.target.value)} />
                {boxesToDispense && dispenseItem && (
                  <p className="midwife-input-hint">
                    = {parseInt(boxesToDispense || 0) * TABLETS_PER_BOX} tablets dispensed.
                    Remaining after: {dispenseItem.remaining - parseInt(boxesToDispense || 0)} boxes
                  </p>
                )}
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Diagnosis / Reason</label>
                <input className="midwife-input" type="text"
                  placeholder="e.g., Upper Respiratory Tract Infection"
                  value={diagnosis} onChange={e => setDiagnosis(e.target.value)} />
              </div>
            </div>
            <div className="midwife-modal-footer">
              <button className="midwife-btn-secondary" onClick={() => setShowDispenseModal(false)}>Cancel</button>
              <button className="midwife-btn-primary" onClick={saveDispense} disabled={dispensing}>
                {dispensing ? "Dispensing..." : "Confirm Dispense"}
              </button>
            </div>
          </div>
        </div>
      )}


    </div>
  );
}