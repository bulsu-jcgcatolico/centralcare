import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, doc, updateDoc,
  serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { runExpiryChecks } from "../../utils/expiryNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import { FHSIS_ANTIGENS, FHSIS_ANTIGEN_ORDER } from "../../utils/fhsisImmunization";
import "./CHOBatchInventory.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Population Report", to: "/cho/population-report"  },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Balance Reports",   to: "/cho/balance-reports"    },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Messages",          to: "/cho/messages"           },
  { label: "Notifications",     to: "/cho/notifications"      },
];

const PRODUCTS_COLLECTION = "cho_products";
const BATCHES_COLLECTION  = "cho_batches";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Month key like "2026-09" (sortable). Parsed from the YYYY-MM-DD string
// directly so time zones can't shift a date into the wrong month.
function getMonthKey(dateStr) {
  const m = /^(\d{4})-(\d{2})/.exec(String(dateStr || ""));
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  return `${m[1]}-${m[2]}`;
}

function monthLabel(key) {
  if (!key) return "";
  const [y, m] = key.split("-");
  return `${MONTHS[+m - 1]} ${y}`;
}

function generateBatchId() {
  return "BAT" + Math.floor(10000 + Math.random() * 89999).toString();
}

const EXPIRY_WARNING_DAYS = 90; // items expiring within this many days count as "Expiring Soon"
function daysUntil(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = String(dateStr).slice(0, 10).split("-").map(Number);
  return Math.round((new Date(y, m - 1, d) - today) / 86400000);
}

export default function CHOBatchInventory() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const unreadMessages = useUnreadMessageCount();

  const [search, setSearch] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState("all");
  
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);

  // Edit-batch modal (fix mistakes in lot number, quantity, or dates)
  const [editingBatch, setEditingBatch] = useState(null);
  const [editLot, setEditLot] = useState("");
  const [editQty, setEditQty] = useState("");
  const [editMfg, setEditMfg] = useState("");
  const [editExpiry, setEditExpiry] = useState("");
  const [productIdInput, setProductIdInput] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [isVaccine, setIsVaccine] = useState(false);
  const [doseType, setDoseType] = useState("single"); // "single" | "multi"
  const [dosesPerVial, setDosesPerVial] = useState("");
  const [fhsisAntigen, setFhsisAntigen] = useState("other");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadProducts(); loadBatches(); }, []);

  async function loadProducts() {
    try {
      const snap = await getDocs(collection(db, PRODUCTS_COLLECTION));
      setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  }

  async function loadBatches() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, BATCHES_COLLECTION));
      const list = snap.docs.map(d => {
        const data = d.data();
        return {
          id: d.id,
          ...data,
          // Month the batch was added to inventory (falls back to the
          // manufacture / expiry date for older records without addedDate).
          month: getMonthKey(data.addedDate || data.manufactureDate || data.expiryDate),
        };
      });
      setBatches(list);
      runExpiryChecks(
        list.map(b => ({ id: b.id, name: b.name, expiry: b.expiryDate })),
        "cho",
        {}
      );
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const matchedProduct = products.find(
    p => (p.productId || "").toLowerCase() === productIdInput.trim().toLowerCase()
  );

  function openAddModal() {
    setProductIdInput(""); setLotNumber(""); setQuantity("");
    setManufactureDate(""); setExpiryDate("");
    setIsVaccine(false); setDoseType("single"); setDosesPerVial(""); setFhsisAntigen("other");
    setShowAddModal(true);
  }

  function openEditModal(b) {
    setEditingBatch(b);
    setEditLot(b.lotNumber || "");
    setEditQty(String(b.quantity ?? ""));
    setEditMfg(b.manufactureDate || "");
    setEditExpiry(b.expiryDate || "");
  }

  async function saveEdit() {
    if (!editLot.trim() || !editQty || !editMfg || !editExpiry) {
      alert("Please fill in Lot Number, Quantity, Manufacture Date, and Expiry Date.");
      return;
    }
    const newQty = parseInt(editQty);
    if (isNaN(newQty) || newQty < 0) { alert("Quantity must be a valid number."); return; }
    if (editExpiry <= editMfg) { alert("Expiry Date must be after the Manufacture Date."); return; }

    // Keep "remaining" consistent: stock already given out stays given out,
    // so shift remaining by the same amount the initial quantity changed.
    const oldQty = editingBatch.quantity || 0;
    const oldRemaining = editingBatch.remaining ?? oldQty;
    const newRemaining = oldRemaining + (newQty - oldQty);
    if (newRemaining < 0) {
      alert(`Quantity can't be lower than what was already distributed (${oldQty - oldRemaining}).`);
      return;
    }
    setSaving(true);
    try {
      await updateDoc(doc(db, BATCHES_COLLECTION, editingBatch.id), {
        lotNumber: editLot.trim(),
        quantity: newQty,
        remaining: newRemaining,
        manufactureDate: editMfg,
        expiryDate: editExpiry,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid ?? "",
      });
      setEditingBatch(null);
      loadBatches();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  async function saveBatch() {
    if (!productIdInput.trim()) {
      alert("Please enter a Product ID.");
      return;
    }
    if (!matchedProduct) {
      alert(`No product found with ID "${productIdInput.trim()}". Add it in Item Management first.`);
      return;
    }
    if (!lotNumber.trim() || !quantity || !manufactureDate || !expiryDate) {
      alert("Please fill in Lot Number, Quantity, Manufacture Date, and Expiry Date.");
      return;
    }
    if (isVaccine && doseType === "multi" && (!dosesPerVial || parseInt(dosesPerVial) <= 0)) {
      alert("Please enter Doses per Vial for this multi-dose vaccine.");
      return;
    }
    setSaving(true);
    try {
      const qty = parseInt(quantity);
      const currentDateStr = new Date().toISOString().split("T")[0];

      await addDoc(collection(db, BATCHES_COLLECTION), {
        batchId: generateBatchId(),
        productId: matchedProduct.productId,
        name: matchedProduct.name,
        category: matchedProduct.category,
        subCategory: matchedProduct.subCategory ?? "",
        brand: matchedProduct.brand ?? "",
        lotNumber: lotNumber.trim(),
        quantity: qty,
        remaining: qty,
        manufactureDate: manufactureDate, 
        expiryDate: expiryDate,
        addedDate: currentDateStr,        
        ownerType: "cho",
        isVaccine,
        doseType: isVaccine ? doseType : "",
        fhsisAntigen: isVaccine ? fhsisAntigen : "",
        dosesPerVial: isVaccine && doseType === "multi" ? parseInt(dosesPerVial) : (isVaccine ? 1 : 0),
        createdBy: user?.uid ?? "",
        createdAt: serverTimestamp(),
      });
      alert("Batch saved successfully!");
      setShowAddModal(false);
      loadBatches();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  // Generate dynamic list of available months from batches
  const months = [...new Set(batches.map(b => b.month).filter(Boolean))].sort().reverse();

  // Product ID dropdown options (one entry per product that has batches)
  const productOptions = [...new Map(
    batches.filter(b => b.productId).map(b => [b.productId, b.name])
  ).entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // Filter batches by search keyword and dropdown month selection
  const filteredBatches = batches
    .filter(b => {
      const matchesSearch = 
        (b.name || "").toLowerCase().includes(search.toLowerCase()) ||
        (b.productId || "").toLowerCase().includes(search.toLowerCase()) ||
        (b.batchId || "").toLowerCase().includes(search.toLowerCase()) ||
        (b.lotNumber || "").toLowerCase().includes(search.toLowerCase());

      const matchesMonth = selectedMonth === "all" || b.month === selectedMonth;
      const matchesProduct = selectedProduct === "all" || b.productId === selectedProduct;
      return matchesSearch && matchesMonth && matchesProduct;
    })
    .slice()
    .sort((a, b) => {
      const remA = a.remaining ?? a.quantity ?? 0;
      const remB = b.remaining ?? b.quantity ?? 0;
      const aDepleted = remA <= 0;
      const bDepleted = remB <= 0;
      if (aDepleted !== bDepleted) return aDepleted ? 1 : -1; // depleted sinks to bottom
      return 0; // preserve existing relative order otherwise
    });

  const totalRemainingQuantity = filteredBatches.reduce((s, b) => s + ((b.remaining ?? b.quantity) || 0), 0);
  const totalInitialQuantity = filteredBatches.reduce((s, b) => s + (b.quantity || 0), 0);
  // Same "due within N days" rule (EXPIRY_WARNING_DAYS) used on the RHU and Midwife
  // Inventory pages — only counts batches that still have stock left.
  const expiringCount = filteredBatches.filter(b => {
    if (!b.expiryDate) return false;
    const remaining = b.remaining ?? b.quantity ?? 0;
    if (remaining <= 0) return false;
    const days = daysUntil(b.expiryDate);
    return days <= EXPIRY_WARNING_DAYS && days >= 0;
  }).length;
  const periodLabel = selectedMonth === "all" ? "All time" : monthLabel(selectedMonth);

  return (
    <div>
      <div className="cho-screen-only">
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
              {navItems.map((item) => (
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
              <NavLink to="/cho/settings" className="cho-nav-item cho-nav-btn">Settings</NavLink>
              <button className="cho-nav-item cho-nav-btn cho-signout" onClick={handleLogout}>Sign out</button>
            </div>
          </aside>

          <div className="cho-main">
            <header className="cho-topbar">
              <input className="cho-search" type="text"
                placeholder="Search product ID, name, or lot number..."
                value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <div className="cho-page-header">
                <div>
                  <h1 className="cho-page-title">Batch Inventory</h1>
                  <p className="cho-page-sub">Log incoming stock batches by Product ID — lot number, quantity, manufacture and expiry dates.</p>
                </div>
                {/* Header Action Bar matching CHOReports filter format */}
                <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                  <select className="cho-input" style={{ width: "auto", minWidth: "180px" }}
                    value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)}>
                    <option value="all">All Product IDs</option>
                    {productOptions.map(([id, name]) => <option key={id} value={id}>{id} — {name}</option>)}
                  </select>
                  <select className="cho-input" style={{ width: "auto", minWidth: "160px" }}
                    value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
                    <option value="all">All Months (date added)</option>
                    {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                  </select>
                  <button className="cho-btn-secondary" onClick={() => window.print()}>Print / PDF</button>
                  <button className="cho-btn-primary" onClick={openAddModal}>+ Add New Batch</button>
                </div>
              </div>

              <div className="cho-stats-grid cho-stats-grid--3" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                <div className="cho-stat-card">
                  <p className="cho-stat-label">TOTAL BATCHES</p>
                  <div className="cho-stat-row"><span className="cho-stat-value">{filteredBatches.length}</span></div>
                  <p className="cho-stat-sub">{periodLabel}</p>
                </div>
                <div className="cho-stat-card cho-stat--green">
                  <p className="cho-stat-label">REMAINING MEDICINES / BOXES</p>
                  <div className="cho-stat-row"><span className="cho-stat-value">{totalRemainingQuantity}</span></div>
                  <p className="cho-stat-sub">{periodLabel}</p>
                </div>
                <div className="cho-stat-card">
                  <p className="cho-stat-label">INITIAL QUANTITY</p>
                  <div className="cho-stat-row"><span className="cho-stat-value">{totalInitialQuantity}</span></div>
                  <p className="cho-stat-sub">{periodLabel}</p>
                </div>
                <div className="cho-stat-card" style={{ borderColor: expiringCount > 0 ? "#fecaca" : undefined }}>
                  <p className="cho-stat-label" style={{ color: expiringCount > 0 ? "#dc2626" : undefined }}>EXPIRING SOON</p>
                  <div className="cho-stat-row">
                    <span className="cho-stat-value" style={{ color: expiringCount > 0 ? "#dc2626" : undefined }}>{expiringCount}</span>
                  </div>
                  <p className="cho-stat-sub">Within {EXPIRY_WARNING_DAYS} days</p>
                </div>
              </div>

              {loading ? (
                <div className="cho-empty-state"><p>Loading batch inventory...</p></div>
              ) : filteredBatches.length === 0 ? (
                <div className="cho-empty-state">
                  <div className="cho-empty-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                      <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                    </svg>
                  </div>
                  <h2 className="cho-empty-title">No Batches for {periodLabel}</h2>
                  <p className="cho-empty-text">No batch inventory matches your search criteria or selected month.</p>
                  <button className="cho-btn-primary" onClick={openAddModal}>+ Add New Batch</button>
                </div>
              ) : (
                <section className="cho-section">
                  <div className="cho-table-wrapper">
                  <table className="cho-table">
                    <thead>
                      <tr>
                        <th>BATCH ID</th>
                        <th>PRODUCT ID</th>
                        <th>NAME</th>
                        <th>CATEGORY</th>
                        <th>SUB-CATEGORY</th>
                        <th>LOT #</th>
                        <th>INITIAL QTY</th>
                        <th>REMAINING</th>
                        <th>MANUFACTURE DATE</th>
                        <th>DATE ADDED</th>
                        <th>EXPIRY</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBatches.map(b => {
                        const remaining = (b.remaining ?? b.quantity) || 0;
                        return (
                          <tr key={b.id}>
                            <td className="cho-product-key"><strong>{b.batchId || "—"}</strong></td>
                            <td className="cho-product-key">{b.productId || "—"}</td>
                            <td><strong>{b.name}</strong></td>
                            <td>{b.category}</td>
                            <td>
                              {b.subCategory
                                ? <span className="cho-subcategory-pill">{b.subCategory}</span>
                                : "—"}
                              {b.isVaccine && (
                                <span className="cho-subcategory-pill" style={{ marginLeft: "4px" }}>
                                  {b.doseType === "multi" ? `Vaccine · ${b.dosesPerVial}/vial` : "Vaccine · single-dose"}
                                </span>
                              )}
                            </td>
                            <td className="cho-product-key">{b.lotNumber || "—"}</td>
                            <td>{b.quantity} {b.isVaccine ? "vials" : "boxes"}</td>
                            <td><strong>{remaining} {b.isVaccine ? "vials" : "boxes"}</strong></td>
                            <td>{b.manufactureDate || "—"}</td>
                            <td>{b.addedDate || "—"}</td>
                            <td>{b.expiryDate}</td>
                            <td>
                              <button className="cho-btn-secondary" style={{ padding: "4px 12px", fontSize: "12px" }}
                                onClick={() => openEditModal(b)}>Edit</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </section>
              )}
            </main>
          </div>
        </div>
      </div>

      {/* ── Print-Only View ── */}
      <div className="cho-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>Batch Inventory Report</h1>
          <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>CHO — {periodLabel}</p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Total Batches:</strong> {filteredBatches.length}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Remaining Quantity:</strong> {totalRemainingQuantity}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Initial Quantity:</strong> {totalInitialQuantity}
                </td>
              </tr>
            </tbody>
          </table>

          {filteredBatches.length === 0 ? (
            <p style={{ fontSize: "13px" }}>No records for {periodLabel}.</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr>
                  {["Batch ID", "Product ID", "Name", "Lot #", "Initial Qty", "Remaining", "Manufacture Date", "Date Added", "Expiry"].map(h => (
                    <th key={h} style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredBatches.map(b => (
                  <tr key={b.id}>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{b.batchId || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{b.productId || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{b.name || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{b.lotNumber || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{b.quantity || 0}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{(b.remaining ?? b.quantity) || 0}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{b.manufactureDate || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{b.addedDate || "—"}</td>
                    <td style={{ border: "1px solid #999", padding: "6px" }}>{b.expiryDate || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .cho-screen-only { display: none !important; }
          .cho-print-only  { display: block !important; }
        }

        /* Let the batch table expand to fit every row and scroll with the
           page, instead of being boxed into its own internal scrollbar. */
        .cho-table-wrapper {
          max-height: none !important;
          height: auto !important;
          overflow-y: visible !important;
          overflow-x: auto !important;
        }
      `}</style>

      {/* ── Edit Batch Modal ── */}
      {editingBatch && (
        <div className="cho-modal-overlay" onClick={() => setEditingBatch(null)}>
          <div className="cho-modal cho-modal--md" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">Edit Batch — {editingBatch.batchId}</h2>
              <button className="cho-modal-close" aria-label="Close" onClick={() => setEditingBatch(null)}>×</button>
            </div>
            <div className="cho-modal-body">
              <div className="cho-product-preview">
                <div className="cho-product-preview-row"><span>Product</span><strong>{editingBatch.productId} — {editingBatch.name}</strong></div>
                <div className="cho-product-preview-row"><span>Remaining</span><strong>{(editingBatch.remaining ?? editingBatch.quantity) || 0} {editingBatch.isVaccine ? "vials" : "boxes"}</strong></div>
              </div>
              {(editingBatch.remaining ?? editingBatch.quantity) < editingBatch.quantity && (
                <p className="cho-form-hint" style={{ color: "#b45309" }}>
                  Part of this batch has already been distributed. Changes here won't update copies already sent to RHUs.
                </p>
              )}
              <div className="cho-form-row cho-form-row--3">
                <div className="cho-form-field">
                  <label className="cho-label">Lot Number <span className="cho-required">*</span></label>
                  <input className="cho-input" type="text" value={editLot} onChange={e => setEditLot(e.target.value)} />
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Initial Quantity <span className="cho-required">*</span></label>
                  <input className="cho-input" type="number" min="0" value={editQty} onChange={e => setEditQty(e.target.value)} />
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Manufacture Date <span className="cho-required">*</span></label>
                  <input className="cho-input" type="date" value={editMfg} onChange={e => setEditMfg(e.target.value)} />
                </div>
              </div>
              <div className="cho-form-field">
                <label className="cho-label">Expiry Date <span className="cho-required">*</span></label>
                <input className="cho-input" type="date" value={editExpiry} onChange={e => setEditExpiry(e.target.value)} />
              </div>
              <p className="cho-form-hint">Product and batch ID can't be changed. Remaining stock adjusts automatically if you change the quantity.</p>
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setEditingBatch(null)}>Cancel</button>
              <button className="cho-btn-primary" onClick={saveEdit} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Batch Modal ── */}
      {showAddModal && (
        <div className="cho-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="cho-modal cho-modal--md" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">Add New Batch</h2>
              <button className="cho-modal-close" aria-label="Close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">

              <h3 className="cho-form-section-title">Product Lookup</h3>
              <div className="cho-form-field">
                <label className="cho-label">Product ID <span className="cho-required">*</span></label>
                <input className="cho-input" type="text" placeholder="e.g., TAB001"
                  value={productIdInput} onChange={e => setProductIdInput(e.target.value)} />
              </div>

              {productIdInput.trim() && (
                matchedProduct ? (
                  <div className="cho-product-preview">
                    <div className="cho-product-preview-row"><span>Name</span><strong>{matchedProduct.name}</strong></div>
                    <div className="cho-product-preview-row"><span>Category</span><strong>{matchedProduct.category}</strong></div>
                    <div className="cho-product-preview-row"><span>Brand</span><strong>{matchedProduct.brand || "—"}</strong></div>
                  </div>
                ) : (
                  <div className="cho-product-preview cho-product-preview--notfound">
                    No product found with this ID. Add it in Item Management first.
                  </div>
                )
              )}

              <h3 className="cho-form-section-title">Batch Details</h3>
              <div className="cho-form-row cho-form-row--3">
                <div className="cho-form-field">
                  <label className="cho-label">Lot Number <span className="cho-required">*</span></label>
                  <input className="cho-input" type="text" placeholder="e.g., LOT-2026-0143"
                    value={lotNumber} onChange={e => setLotNumber(e.target.value)} />
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Stocks/Quantity (boxes) <span className="cho-required">*</span></label>
                  <input className="cho-input" type="number" placeholder="e.g., 100"
                    value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Manufacture Date <span className="cho-required">*</span></label>
                  <input className="cho-input" type="date"
                    value={manufactureDate} onChange={e => setManufactureDate(e.target.value)} />
                </div>
              </div>
              <div className="cho-form-field">
                <label className="cho-label">Expiry Date <span className="cho-required">*</span></label>
                <input className="cho-input" type="date"
                  value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
              </div>

              <h3 className="cho-form-section-title">Vaccine Classification</h3>
              <div className="cho-form-field">
                <label className="cho-label" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" checked={isVaccine}
                    onChange={e => setIsVaccine(e.target.checked)} />
                  This batch is a vaccine (tracked in vials, not boxes)
                </label>
              </div>
              {isVaccine && (
                <div className="cho-form-row">
                  <div className="cho-form-field">
                    <label className="cho-label">Dose Type <span className="cho-required">*</span></label>
                    <select className="cho-input" value={doseType} onChange={e => setDoseType(e.target.value)}>
                      <option value="single">Single-dose (1 vial = 1 dose)</option>
                      <option value="multi">Multi-dose (vial holds several doses)</option>
                    </select>
                  </div>
                  {doseType === "multi" && (
                    <div className="cho-form-field">
                      <label className="cho-label">Doses per Vial <span className="cho-required">*</span></label>
                      <input className="cho-input" type="number" min="1" placeholder="e.g., 10 (measles)"
                        value={dosesPerVial} onChange={e => setDosesPerVial(e.target.value)} />
                    </div>
                  )}
                  <div className="cho-form-field">
                    <label className="cho-label">FHSIS Antigen Category</label>
                    <select className="cho-input" value={fhsisAntigen} onChange={e => setFhsisAntigen(e.target.value)}>
                      {FHSIS_ANTIGEN_ORDER.map(key => (
                        <option key={key} value={key}>{FHSIS_ANTIGENS[key].label}</option>
                      ))}
                      <option value="other">{FHSIS_ANTIGENS.other.label}</option>
                    </select>
                    <p className="cho-form-hint" style={{ marginTop: "4px" }}>
                      Tags this vaccine for DOH-standard immunization reporting. Choose "Other" if it's not part of the standard EPI schedule.
                    </p>
                  </div>
                </div>
              )}
              <p className="cho-form-hint"><span className="cho-required">*</span> Required fields</p>
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="cho-btn-primary" onClick={saveBatch} disabled={saving}>
                {saving ? "Saving..." : "Save Batch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}