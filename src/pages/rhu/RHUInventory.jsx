import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, where
} from "firebase/firestore";
import { db } from "../../firebase/config";
import "./RHUInventory.css";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"      },
  { label: "Inventory",     to: "/rhu/inventory"      },
  { label: "Distribution",  to: "/rhu/distribution"   },
  { label: "Reports",       to: "/rhu/reports"        },
  { label: "Notifications", to: "/rhu/notifications"  },
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
  if (remaining <= 20) return "rhu-status--critical";
  if (remaining <= 50) return "rhu-status--low";
  return "rhu-status--good";
}

export default function RHUInventory() {
  const { logout, user, userData } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Add modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [productName, setProductName] = useState("");
  const [category, setCategory] = useState("General Consumption");
  const [subCategory, setSubCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [tabletsPerBox, setTabletsPerBox] = useState("");
  const [source, setSource] = useState("");
  const [expiry, setExpiry] = useState("");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadInventory(); }, []);

  async function loadInventory() {
    setLoading(true);
    try {
      const q = query(
        collection(db, "inventory"),
        where("ownerType", "==", "rhu"),
        where("rhuId", "==", userData?.rhuId)
      );
      const snap = await getDocs(q);
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
        tabletsPerBox: parseInt(tabletsPerBox) || 30,
        source,
        expiry,
        ownerType: "rhu",
        rhuId: userData?.rhuId,
        rhuName: userData?.rhuName,
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      alert("✅ Item saved successfully!");
      setProductName(""); setCategory("General Consumption");
      setSubCategory(""); setQuantity(""); setTabletsPerBox(""); setSource(""); setExpiry("");
      setShowAddModal(false);
      loadInventory();
    } catch (err) { alert("❌ Error: " + err.message); }
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
    <div className="rhu-layout">
      <aside className="rhu-sidebar">
        <div className="rhu-brand">
          <div className="rhu-brand-icon">
            <svg viewBox="0 0 24 24" fill="white" width="20" height="20">
              <path d="M19 3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
            </svg>
          </div>
          <div>
            <p className="rhu-brand-name">CentralCare</p>
            <p className="rhu-brand-role">RHU UNIT PANEL</p>
          </div>
        </div>
        <nav className="rhu-nav">
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "rhu-nav-item" + (isActive ? " active" : "")}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="rhu-sidebar-footer">
          <button className="rhu-nav-item rhu-nav-btn">Settings</button>
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="rhu-main">
        <header className="rhu-topbar">
          <input className="rhu-search" type="text"
            placeholder="Search medical supplies..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="rhu-topbar-right">
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">{userData?.username || "RHU Admin"}</span>
                <span className="rhu-user-role">{userData?.rhuName || "RHU Unit"}</span>
              </div>
              <div className="rhu-avatar">RH</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header">
            <div>
              <h1 className="rhu-page-title">Inventory Monitoring</h1>
              <p className="rhu-page-sub">Manage and track healthcare supplies for {userData?.rhuName || "your RHU"}.</p>
            </div>
            <button className="rhu-btn-primary" onClick={() => setShowAddModal(true)}>+ Add New Item</button>
          </div>

          {/* Stats */}
          <div className="rhu-stats-grid rhu-stats-grid--4">
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL ITEMS</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{inventory.length}</span></div>
            </div>
            <div className="rhu-stat-card rhu-stat--orange">
              <p className="rhu-stat-label">LOW STOCK</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{lowStockCount}</span></div>
            </div>
            <div className="rhu-stat-card rhu-stat--red">
              <p className="rhu-stat-label">EXPIRING SOON</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{expiringCount}</span></div>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL QUANTITY</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">{inventory.reduce((s, i) => s + (i.quantity || 0), 0)}</span>
              </div>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="rhu-empty-state"><p>Loading inventory...</p></div>
          ) : filteredInventory.length === 0 ? (
            <div className="rhu-empty-state">
              <div className="rhu-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <h2 className="rhu-empty-title">No Inventory Items Yet</h2>
              <p className="rhu-empty-text">Click "+ Add New Item" to add your first item, or wait for CHO to distribute supplies.</p>
              <button className="rhu-btn-primary" onClick={() => setShowAddModal(true)}>+ Add Your First Item</button>
            </div>
          ) : (
            <section className="rhu-inv-section">
              <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="rhu-inv-table">
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
                        <td className="rhu-product-key">{item.productKey || "—"}</td>
                        <td><strong>{item.name}</strong></td>
                        <td>{item.category}</td>
                        <td>
                          {item.subCategory
                            ? <span className="rhu-subcategory-pill">{item.subCategory}</span>
                            : "—"}
                        </td>
                        <td>{item.quantity} boxes</td>
                        <td><strong>{remaining} boxes</strong></td>
                        <td>{item.expiry}</td>
                        <td>
                          <span className={`rhu-inv-status-badge ${getStatusClass(remaining)}`}>
                            <span className={`rhu-status-dot rhu-dot--${getStatus(remaining).toLowerCase()}`} />
                            {getStatus(remaining)}
                          </span>
                        </td>
                        <td>
                          <div className="rhu-action-group">
                            <button className="rhu-btn-action rhu-btn-del" onClick={() => deleteItem(item.id)}>
                              Delete
                            </button>
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

      {/* ── Add Item Modal ── */}
      {showAddModal && (
        <div className="rhu-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="rhu-modal" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Add New Inventory Item</h2>
              <button className="rhu-modal-close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <div className="rhu-form-field">
                <label className="rhu-label">Product Name *</label>
                <input className="rhu-input" type="text" placeholder="e.g., Amoxicillin 500mg Tablet"
                  value={productName} onChange={e => setProductName(e.target.value)} />
              </div>
              <div className="rhu-form-row">
                <div className="rhu-form-field">
                  <label className="rhu-label">Category</label>
                  <select className="rhu-input" value={category} onChange={e => setCategory(e.target.value)}>
                    <option>General Consumption</option>
                    <option>Non-Consumption</option>
                  </select>
                </div>
                <div className="rhu-form-field">
                  <label className="rhu-label">Sub-Category</label>
                  <input className="rhu-input" type="text" placeholder="e.g., Antibiotic"
                    value={subCategory} onChange={e => setSubCategory(e.target.value)} />
                </div>
              </div>
              <div className="rhu-form-row">
                <div className="rhu-form-field">
                  <label className="rhu-label">Quantity (boxes) *</label>
                  <input className="rhu-input" type="number" placeholder="0"
                    value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
                <div className="rhu-form-field">
                  <label className="rhu-label">Tablets per Box *</label>
                  <input className="rhu-input" type="number" placeholder="e.g., 30"
                    value={tabletsPerBox} onChange={e => setTabletsPerBox(e.target.value)} />
                </div>
              </div>
              <div className="rhu-form-row">
                <div className="rhu-form-field">
                  <label className="rhu-label">Source</label>
                  <select className="rhu-input" value={source} onChange={e => setSource(e.target.value)}>
                    <option value="">Select Source</option>
                    <option value="CHO">From CHO</option>
                    <option value="DOH">DOH</option>
                    <option value="LGU">LGU</option>
                  </select>
                </div>
                <div className="rhu-form-field">
                  <label className="rhu-label">Expiry Date *</label>
                  <input className="rhu-input" type="date"
                    value={expiry} onChange={e => setExpiry(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="rhu-btn-primary" onClick={saveItem} disabled={saving}>
                {saving ? "Saving..." : "Save Item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}