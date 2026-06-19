import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, where
} from "firebase/firestore";
import { db } from "../../firebase/config";
import "./CHOInventory.css";

const navItems = [
  { label: "Dashboard",    to: "/cho/dashboard"    },
  { label: "Inventory",    to: "/cho/inventory"    },
  { label: "Distribution", to: "/cho/distribution" },
  { label: "Reports",      to: "/cho/reports"      },
  { label: "Notifications",to: "/cho/notifications"},
];

function generateProductKey() {
  return Math.floor(10000 + Math.random() * 89999).toString();
}

function getStatus(remaining) {
  if (remaining <= 20) return "Critical";
  if (remaining <= 50) return "Low";
  return "Good";
}

function getStatusClass(remaining) {
  if (remaining <= 20) return "cho-status--critical";
  if (remaining <= 50) return "cho-status--low";
  return "cho-status--good";
}

export default function CHOInventory() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("General Consumption");
  const [subCategory, setSubCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [source, setSource] = useState("");
  const [expiry, setExpiry] = useState("");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadInventory(); }, []);

  async function loadInventory() {
    setLoading(true);
    try {
      const q = query(collection(db, "inventory"), where("ownerType", "==", "cho"));
      const snapshot = await getDocs(q);
      setInventory(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function saveItem() {
    if (!productName.trim() || !quantity || !expiry) {
      alert("Please fill in Product Name, Quantity, and Expiry Date");
      return;
    }
    setSaving(true);
    try {
      const qty = parseInt(quantity);
      await addDoc(collection(db, "inventory"), {
        productKey: generateProductKey(),
        name: productName,
        category,
        subCategory,
        quantity: qty,
        remaining: qty,
        source,
        expiry,
        ownerType: "cho",
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      alert("Item saved successfully!");
      setProductName(""); setCategory("General Consumption");
      setSubCategory(""); setQuantity(""); setSource(""); setExpiry("");
      setShowAddModal(false);
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  async function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    try {
      await deleteDoc(doc(db, "inventory", id));
      setInventory(inventory.filter(i => i.id !== id));
    } catch (err) { alert("Error: " + err.message); }
  }

  const filteredInventory = inventory.filter(item =>
    item.name?.toLowerCase().includes(search.toLowerCase())
  );
  const lowStockCount = inventory.filter(i => (i.remaining ?? i.quantity) <= 50).length;
  const expiringCount = inventory.filter(i => {
    if (!i.expiry) return false;
    const days = (new Date(i.expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= 30 && days >= 0;
  }).length;

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
              {item.label}
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
            placeholder="Search medical supplies..."
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
              <h1 className="cho-page-title">Inventory Monitoring</h1>
              <p className="cho-page-sub">Manage and track healthcare supplies across all programs.</p>
            </div>
            <button className="cho-btn-primary" onClick={() => setShowAddModal(true)}>+ Add New Item</button>
          </div>

          <div className="cho-stats-grid cho-stats-grid--4">
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL ITEMS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{inventory.length}</span></div>
            </div>
            <div className="cho-stat-card cho-stat--orange">
              <p className="cho-stat-label">LOW STOCK ITEMS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{lowStockCount}</span></div>
            </div>
            <div className="cho-stat-card cho-stat--red">
              <p className="cho-stat-label">EXPIRING SOON</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{expiringCount}</span></div>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL QUANTITY</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{inventory.reduce((s, i) => s + (i.quantity || 0), 0)}</span>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="cho-empty-state"><p>Loading inventory...</p></div>
          ) : filteredInventory.length === 0 ? (
            <div className="cho-empty-state">
              <div className="cho-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <h2 className="cho-empty-title">No Inventory Items Yet</h2>
              <p className="cho-empty-text">Click "+ Add New Item" to add your first item.</p>
              <button className="cho-btn-primary" onClick={() => setShowAddModal(true)}>+ Add Your First Item</button>
            </div>
          ) : (
            <section className="cho-section">
              <table className="cho-table">
                <thead>
                  <tr>
                    <th>PRODUCT KEY</th>
                    <th>ITEM NAME</th>
                    <th>CATEGORY</th>
                    <th>SUB-CATEGORY</th>
                    <th>QUANTITY</th>
                    <th>REMAINING</th>
                    <th>EXPIRY</th>
                    <th>STATUS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredInventory.map(item => {
                    const remaining = item.remaining ?? item.quantity;
                    return (
                      <tr key={item.id}>
                        <td className="cho-product-key">{item.productKey || "—"}</td>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.category}</td>
                        <td>
                          {item.subCategory
                            ? <span className="cho-subcategory-pill">{item.subCategory}</span>
                            : "—"}
                        </td>
                        <td>{item.quantity} boxes</td>
                        <td><strong>{remaining} boxes</strong></td>
                        <td>{item.expiry}</td>
                        <td>
                          <span className={`cho-status-badge ${getStatusClass(remaining)}`}>
                            <span className={`cho-status-dot cho-dot--${getStatus(remaining).toLowerCase()}`} />
                            {getStatus(remaining)}
                          </span>
                        </td>
                        <td>
                          <div className="cho-action-group">
                            <button className="cho-btn-action cho-btn-danger" onClick={() => deleteItem(item.id)}>
                              Delete
                            </button>
                          </div>
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

      {/* ── Add Item Modal ── */}
      {showAddModal && (
        <div className="cho-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="cho-modal" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">Add New Inventory Item</h2>
              <button className="cho-modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">
              <div className="cho-form-field">
                <label className="cho-label">Product Name *</label>
                <input className="cho-input" type="text" placeholder="e.g., Amoxicillin 500mg Tablet"
                  value={productName} onChange={e => setProductName(e.target.value)} />
              </div>
              <div className="cho-form-row">
                <div className="cho-form-field">
                  <label className="cho-label">Category</label>
                  <select className="cho-input" value={category} onChange={e => setCategory(e.target.value)}>
                    <option>General Consumption</option>
                    <option>Non-Consumption</option>
                  </select>
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Sub-Category</label>
                  <input className="cho-input" type="text" placeholder="e.g., Antibiotic"
                    value={subCategory} onChange={e => setSubCategory(e.target.value)} />
                </div>
              </div>
              <div className="cho-form-row">
                <div className="cho-form-field">
                  <label className="cho-label">Quantity (boxes) *</label>
                  <input className="cho-input" type="number" placeholder="0"
                    value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Source</label>
                  <select className="cho-input" value={source} onChange={e => setSource(e.target.value)}>
                    <option value="">Select Source</option>
                    <option value="DOH">DOH</option>
                    <option value="LGU">LGU</option>
                  </select>
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Expiry Date *</label>
                  <input className="cho-input" type="date"
                    value={expiry} onChange={e => setExpiry(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="cho-btn-primary" onClick={saveItem} disabled={saving}>
                {saving ? "Saving..." : "Save Item"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}