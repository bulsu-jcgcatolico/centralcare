import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { runExpiryChecks } from "../../utils/expiryNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./CHOBatchInventory.css";

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

const PRODUCTS_COLLECTION = "cho_products";
const BATCHES_COLLECTION  = "cho_batches";

function generateBatchId() {
  return "BAT" + Math.floor(10000 + Math.random() * 89999).toString();
}

function getBatchStatusClass(status) {
  switch (status) {
    case "Accepted": return "cho-status--accepted";
    case "Declined": return "cho-status--declined";
    default: return "cho-status--pending";
  }
}

export default function CHOBatchInventory() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [productIdInput, setProductIdInput] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [quantity, setQuantity] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");

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
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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
    setShowAddModal(true);
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
    if (!lotNumber.trim() || !quantity || !expiryDate) {
      alert("Please fill in Lot Number, Stocks/Quantity, and Expiry Date.");
      return;
    }
    setSaving(true);
    try {
      const qty = parseInt(quantity);
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
        manufactureDate,
        expiryDate,
        status: "Pending", // Default status for new batches
        ownerType: "cho",
        createdBy: user?.uid ?? "",
        createdAt: serverTimestamp(),
      });
      alert("Batch saved successfully!");
      setShowAddModal(false);
      loadBatches();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  // Handle Accept / Decline status updates
  async function updateBatchStatus(id, newStatus) {
    try {
      await updateDoc(doc(db, BATCHES_COLLECTION, id), { status: newStatus });
      setBatches(batches.map(b => b.id === id ? { ...b, status: newStatus } : b));
    } catch (err) {
      alert("Error updating batch status: " + err.message);
    }
  }

  async function deleteBatch(id) {
    if (!confirm("Delete this batch record?")) return;
    try {
      await deleteDoc(doc(db, BATCHES_COLLECTION, id));
      setBatches(batches.filter(b => b.id !== id));
    } catch (err) { alert("Error: " + err.message); }
  }

  const filteredBatches = batches.filter(b =>
    (b.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.productId || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.batchId || "").toLowerCase().includes(search.toLowerCase()) ||
    (b.lotNumber || "").toLowerCase().includes(search.toLowerCase())
  );

  const pendingCount = batches.filter(b => (b.status || "Pending") === "Pending").length;
  const acceptedCount = batches.filter(b => b.status === "Accepted").length;
  const expiringCount = batches.filter(b => {
    if (!b.expiryDate) return false;
    const days = (new Date(b.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= 30 && days >= 0;
  }).length;
  const totalQuantity = batches.reduce((s, b) => s + (b.quantity || 0), 0);

  return (
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
        <header className="cho-topbar">
          <input className="cho-search" type="text"
            placeholder="Search product ID, name, or lot number..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
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
          <div className="cho-page-header">
            <div>
              <h1 className="cho-page-title">Batch Inventory</h1>
              <p className="cho-page-sub">Log incoming stock batches by Product ID — lot number, quantity, manufacture and expiry dates.</p>
            </div>
            <button className="cho-btn-primary" onClick={openAddModal}>+ Add New Batch</button>
          </div>

          <div className="cho-stats-grid cho-stats-grid--4">
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL BATCHES</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{batches.length}</span></div>
            </div>
            <div className="cho-stat-card cho-stat--orange">
              <p className="cho-stat-label">PENDING APPROVAL</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{pendingCount}</span></div>
            </div>
            <div className="cho-stat-card cho-stat--green">
              <p className="cho-stat-label">ACCEPTED BATCHES</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{acceptedCount}</span></div>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL QUANTITY</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{totalQuantity}</span></div>
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
              <h2 className="cho-empty-title">No Batches Yet</h2>
              <p className="cho-empty-text">Click "+ Add New Batch" and enter a Product ID from your catalog to log incoming stock.</p>
              <button className="cho-btn-primary" onClick={openAddModal}>+ Add Your First Batch</button>
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
                    <th>QUANTITY</th>
                    <th>REMAINING</th>
                    <th>MANUF. DATE</th>
                    <th>EXPIRY</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBatches.map(b => {
                    const remaining = b.remaining ?? b.quantity;
                    const batchStatus = b.status || "Pending";
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
                        </td>
                        <td className="cho-product-key">{b.lotNumber || "—"}</td>
                        <td>{b.quantity} boxes</td>
                        <td><strong>{remaining} boxes</strong></td>
                        <td>{b.manufactureDate || "—"}</td>
                        <td>{b.expiryDate}</td>
                        <td>
                          <span className={`cho-status-badge ${getBatchStatusClass(batchStatus)}`}>
                            {batchStatus}
                          </span>
                        </td>
                        <td>
                          <div className="cho-action-group">
                            {batchStatus === "Pending" ? (
                              <>
                                <button
                                  className="cho-btn-action cho-btn-success"
                                  onClick={() => updateBatchStatus(b.id, "Accepted")}
                                >
                                  Accept
                                </button>
                                <button
                                  className="cho-btn-action cho-btn-decline"
                                  onClick={() => updateBatchStatus(b.id, "Declined")}
                                >
                                  Decline
                                </button>
                              </>
                            ) : (
                              <button className="cho-btn-action cho-btn-danger" onClick={() => deleteBatch(b.id)}>
                                Delete
                              </button>
                            )}
                          </div>
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
                  <label className="cho-label">Manufacture Date</label>
                  <input className="cho-input" type="date"
                    value={manufactureDate} onChange={e => setManufactureDate(e.target.value)} />
                </div>
              </div>
              <div className="cho-form-field">
                <label className="cho-label">Expiry Date <span className="cho-required">*</span></label>
                <input className="cho-input" type="date"
                  value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
              </div>
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