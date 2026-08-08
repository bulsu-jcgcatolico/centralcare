import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./CHOItemManagement.css";

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

// Prefix used when auto-generating a Product ID based on dosage form
const FORM_PREFIXES = {
  Tablet:     "TAB",
  Capsule:    "CAP",
  Syrup:      "SYR",
  Injection:  "INJ",
  Ointment:   "OIN",
  Drops:      "DRP",
  Other:      "GEN",
};

export default function CHOItemManagement() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [search, setSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null); // productId being edited, or null for new
  const [productId, setProductId] = useState("");
  const [dosageForm, setDosageForm] = useState("Tablet");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("General Consumption");
  const [subCategory, setSubCategory] = useState("");
  const [brand, setBrand] = useState("");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadProducts(); }, []);

  async function loadProducts() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, PRODUCTS_COLLECTION));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
      setProducts(list);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  // --- UPDATED: Generates ID formatted without hyphen as PREFIX001 (e.g. TAB001) ---
  function generateAutoProductId(form, currentProductsList = products) {
    const prefix = FORM_PREFIXES[form] || "GEN";

    // Filter products that start with the prefix (handles TAB001 or legacy TAB-001)
    const matchingProducts = currentProductsList.filter(p => {
      const pId = p.productId || p.id || "";
      return pId.toUpperCase().startsWith(prefix);
    });

    let maxNumber = 0;

    // Extract sequence number from existing IDs
    matchingProducts.forEach(p => {
      const pId = p.productId || p.id || "";
      const numberMatch = pId.match(/\d+/); 
      if (numberMatch) {
        const num = parseInt(numberMatch[0], 10);
        if (!isNaN(num) && num > maxNumber) {
          maxNumber = num;
        }
      }
    });

    const nextNumber = String(maxNumber + 1).padStart(3, "0");
    return `${prefix}${nextNumber}`;
  }

  function handleDosageFormChange(e) {
    const selectedForm = e.target.value;
    setDosageForm(selectedForm);
    if (!editingId) {
      setProductId(generateAutoProductId(selectedForm, products));
    }
  }

  function openAddModal() {
    setEditingId(null);
    const initialForm = "Tablet";
    setDosageForm(initialForm);
    setProductId(generateAutoProductId(initialForm, products));
    setName("");
    setCategory("General Consumption");
    setSubCategory("");
    setBrand("");
    setShowAddModal(true);
  }

  function openEditModal(p) {
    setEditingId(p.id);
    setProductId(p.productId || p.id);
    setDosageForm(p.dosageForm || "Tablet");
    setName(p.name || "");
    setCategory(p.category || "General Consumption");
    setSubCategory(p.subCategory || "");
    setBrand(p.brand || "");
    setShowAddModal(true);
  }

  async function saveProduct() {
    const trimmedId = productId.trim().toUpperCase();
    const trimmedName = name.trim();

    if (!trimmedId || !trimmedName) {
      alert("Please fill in Product ID and Product Name.");
      return;
    }

    setSaving(true);
    try {
      if (!editingId) {
        const existing = await getDoc(doc(db, PRODUCTS_COLLECTION, trimmedId));
        if (existing.exists()) {
          alert(`Product ID "${trimmedId}" already exists. Please use a unique Product ID.`);
          setSaving(false);
          return;
        }
      }

      const docId = editingId || trimmedId;
      await setDoc(doc(db, PRODUCTS_COLLECTION, docId), {
        productId: trimmedId,
        dosageForm,
        name: trimmedName,
        category,
        subCategory: subCategory.trim(),
        brand: brand.trim(),
        createdBy: user?.uid ?? "",
        updatedAt: serverTimestamp(),
      }, { merge: true });

      alert(editingId ? "Product updated successfully!" : "Product added successfully!");
      setShowAddModal(false);
      loadProducts();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  async function deleteProduct(p) {
    if (!confirm(`Delete "${p.name}" (${p.productId}) from catalog?`)) return;
    try {
      await deleteDoc(doc(db, PRODUCTS_COLLECTION, p.id));
      setProducts(products.filter(x => x.id !== p.id));
    } catch (err) { alert("Error: " + err.message); }
  }

  const filteredProducts = products.filter(p =>
    (p.name || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.productId || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.category || "").toLowerCase().includes(search.toLowerCase()) ||
    (p.brand || "").toLowerCase().includes(search.toLowerCase())
  );

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
            placeholder="Search catalog by name, ID, category, or brand..."
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
              <h1 className="cho-page-title">Item Management</h1>
              <p className="cho-page-sub">Master medical catalog — defined products here can be stocked in Batch Inventory.</p>
            </div>
            <button className="cho-btn-primary" onClick={openAddModal}>+ Add New Product</button>
          </div>

          <div className="cho-stats-grid cho-stats-grid--2">
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL CATALOG ITEMS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{products.length}</span></div>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">SEARCH MATCHES</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{filteredProducts.length}</span></div>
            </div>
          </div>

          {loading ? (
            <div className="cho-empty-state"><p>Loading medical catalog...</p></div>
          ) : filteredProducts.length === 0 ? (
            <div className="cho-empty-state">
              <div className="cho-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"/>
                </svg>
              </div>
              <h2 className="cho-empty-title">No Items Found</h2>
              <p className="cho-empty-text">Add your medical items here first to establish Product IDs for inventory logging.</p>
              <button className="cho-btn-primary" onClick={openAddModal}>+ Add First Product</button>
            </div>
          ) : (
            <section className="cho-section">
              <div className="cho-table-wrapper">
                <table className="cho-table">
                  <thead>
                    <tr>
                      <th>PRODUCT ID</th>
                      <th>NAME</th>
                      <th>DOSAGE FORM</th>
                      <th>CATEGORY</th>
                      <th>SUB-CATEGORY</th>
                      <th>BRAND</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map(p => (
                      <tr key={p.id}>
                        <td className="cho-product-key"><strong>{p.productId || p.id}</strong></td>
                        <td><strong>{p.name}</strong></td>
                        <td>{p.dosageForm || "—"}</td>
                        <td>{p.category || "—"}</td>
                        <td>
                          {p.subCategory
                            ? <span className="cho-subcategory-pill">{p.subCategory}</span>
                            : "—"}
                        </td>
                        <td>{p.brand || "—"}</td>
                        <td>
                          <div className="cho-action-group">
                            <button className="cho-btn-action cho-btn-review" onClick={() => openEditModal(p)}>Edit</button>
                            <button className="cho-btn-action cho-btn-danger" onClick={() => deleteProduct(p)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Add / Edit Product Modal */}
      {showAddModal && (
        <div className="cho-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="cho-modal cho-modal--md" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">{editingId ? "Edit Catalog Item" : "Add New Item to Catalog"}</h2>
              <button className="cho-modal-close" aria-label="Close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">
              <div className="cho-form-row">
                <div className="cho-form-field">
                  <label className="cho-label">Dosage Form</label>
                  <select className="cho-input" value={dosageForm} onChange={handleDosageFormChange}>
                    {Object.keys(FORM_PREFIXES).map(form => (
                      <option key={form} value={form}>{form}</option>
                    ))}
                  </select>
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Product ID <span className="cho-required">*</span></label>
                  <input className="cho-input" type="text" placeholder="e.g., TAB001"
                    value={productId} onChange={e => setProductId(e.target.value)}
                    disabled={!!editingId} />
                </div>
              </div>

              <div className="cho-form-field">
                <label className="cho-label">Product Name <span className="cho-required">*</span></label>
                <input className="cho-input" type="text" placeholder="e.g., Amoxicillin 500mg"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div className="cho-form-row">
                <div className="cho-form-field">
                  <label className="cho-label">Category</label>
                  <select className="cho-input" value={category} onChange={e => setCategory(e.target.value)}>
                    <option value="General Consumption">General Consumption</option>
                    <option value="Targeted Programs">Targeted Programs</option>
                    <option value="Emergency Supplies">Emergency Supplies</option>
                    <option value="Equipment & Medical Tools">Equipment & Medical Tools</option>
                  </select>
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Sub-Category</label>
                  <input className="cho-input" type="text" placeholder="e.g., Antibiotic, Maternal Care"
                    value={subCategory} onChange={e => setSubCategory(e.target.value)} />
                </div>
              </div>

              <div className="cho-form-field">
                <label className="cho-label">Brand / Manufacturer</label>
                <input className="cho-input" type="text" placeholder="e.g., Pfizer, Unilab"
                  value={brand} onChange={e => setBrand(e.target.value)} />
              </div>

              {editingId && (
                <p className="cho-form-hint">Product ID cannot be changed after creation.</p>
              )}
              <p className="cho-form-hint"><span className="cho-required">*</span> Required fields</p>
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="cho-btn-primary" onClick={saveProduct} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Product"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}