import { useState, useEffect, useMemo } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, doc, setDoc, getDoc, getDocs, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import { useToast } from "../../context/ToastContext";
import "./CHOItemManagement.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Messages",          to: "/cho/messages"           },
  { label: "Notifications",     to: "/cho/notifications"      },
];

const PRODUCTS_COLLECTION = "cho_products";

// Prefix used when auto-generating a Product ID based on dosage form
const FORM_PREFIXES = {
  Tablet:     "TAB",
  Capsule:    "CAP",
  Syrup:      "SYR",
  Injection:  "INJ",
  Vial:       "VIA",
  Ointment:   "OIN",
  Drops:      "DRP",
  Other:      "GEN",
};

export default function CHOItemManagement() {
  const { logout, user } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const unreadMessages = useUnreadMessageCount();

  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState({
    productId: "", name: "", dosageForm: "", subCategory: "", brand: ""
  });
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
      list.sort((a, b) => {
        const numA = parseInt(String(a.productId || "").match(/\d+/)?.[0] ?? "", 10);
        const numB = parseInt(String(b.productId || "").match(/\d+/)?.[0] ?? "", 10);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) return numA - numB;
        return String(a.productId || "").localeCompare(String(b.productId || ""));
      });
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
      showToast("Please fill in Product ID and Product Name.", "error");
      return;
    }

    setSaving(true);
    try {
      if (!editingId) {
        const existing = await getDoc(doc(db, PRODUCTS_COLLECTION, trimmedId));
        if (existing.exists()) {
          showToast(`Product ID "${trimmedId}" already exists. Please use a unique Product ID.`, "error");
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

      showToast(editingId ? "Product updated successfully!" : "Product added successfully!", "success");
      setShowAddModal(false);
      loadProducts();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSaving(false);
  }

  const setColFilter = (key, value) =>
    setColFilters(prev => ({ ...prev, [key]: value }));
  const clearColFilters = () =>
    setColFilters({ productId: "", name: "", dosageForm: "", subCategory: "", brand: "" });
  const hasColFilters = Object.values(colFilters).some(v => v);

  // Unique values per column for the dropdown filters
  const uniqueOptions = useMemo(() => {
    const uniq = (key) => [...new Set(products.map(p => p[key]).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
    return {
      dosageForm: uniq("dosageForm"),
      subCategory: uniq("subCategory"),
      brand: uniq("brand"),
    };
  }, [products]);

  const filteredProducts = products.filter(p => {
    const q = search.toLowerCase();
    const matchesSearch =
      (p.name || "").toLowerCase().includes(q) ||
      (p.productId || "").toLowerCase().includes(q) ||
      (p.dosageForm || "").toLowerCase().includes(q) ||
      (p.subCategory || "").toLowerCase().includes(q) ||
      (p.brand || "").toLowerCase().includes(q);
    if (!matchesSearch) return false;

    const f = colFilters;
    if (f.productId && !(p.productId || p.id || "").toLowerCase().includes(f.productId.toLowerCase())) return false;
    if (f.name && !(p.name || "").toLowerCase().includes(f.name.toLowerCase())) return false;
    if (f.dosageForm && (p.dosageForm || "") !== f.dosageForm) return false;
    if (f.subCategory && (p.subCategory || "") !== f.subCategory) return false;
    if (f.brand && (p.brand || "") !== f.brand) return false;
    return true;
  });

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
            placeholder="Search catalog by name, ID, form, category, or brand..."
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
          ) : products.length === 0 ? (
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
                <table className="cho-table cho-item-table">
                  <colgroup>
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "12%" }} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>
                        <div className="cho-th-label">PRODUCT ID</div>
                        <input className="cho-th-filter" type="text" placeholder="Filter..." value={colFilters.productId} onChange={e => setColFilter("productId", e.target.value)} />
                      </th>
                      <th>
                        <div className="cho-th-label">MEDICINE NAME AND STRENGTH</div>
                        <input className="cho-th-filter" type="text" placeholder="Filter..." value={colFilters.name} onChange={e => setColFilter("name", e.target.value)} />
                      </th>
                      <th>
                        <div className="cho-th-label">FORM</div>
                        <select className="cho-th-filter" value={colFilters.dosageForm} onChange={e => setColFilter("dosageForm", e.target.value)}>
                          <option value="">All</option>
                          {uniqueOptions.dosageForm.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </th>
                      <th>
                        <div className="cho-th-label">CATEGORY</div>
                        <select className="cho-th-filter" value={colFilters.subCategory} onChange={e => setColFilter("subCategory", e.target.value)}>
                          <option value="">All</option>
                          {uniqueOptions.subCategory.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </th>
                      <th>
                        <div className="cho-th-label">BRAND</div>
                        <select className="cho-th-filter" value={colFilters.brand} onChange={e => setColFilter("brand", e.target.value)}>
                          <option value="">All</option>
                          {uniqueOptions.brand.map(v => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </th>
                      <th>
                        <div className="cho-th-label">ACTION</div>
                        {hasColFilters && (
                          <button className="cho-th-clear" onClick={clearColFilters}>Clear filters</button>
                        )}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.length === 0 && (
                      <tr><td colSpan={6} style={{ textAlign: "center", padding: "24px", color: "#6b7280" }}>No items match the current filters.</td></tr>
                    )}
                    {filteredProducts.map(p => (
                      <tr key={p.id}>
                        <td className="cho-product-key"><strong>{p.productId || p.id}</strong></td>
                        <td><strong>{p.name}</strong></td>
                        <td>{p.dosageForm || "—"}</td>
                        <td>
                          {p.subCategory
                            ? <span className="cho-subcategory-pill">{p.subCategory}</span>
                            : "—"}
                        </td>
                        <td>{p.brand || "—"}</td>
                        <td>
                          <div className="cho-action-group">
                            <button className="cho-btn-action cho-btn-review" onClick={() => openEditModal(p)}>Edit</button>
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
                  <label className="cho-label">Form</label>
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
                <label className="cho-label">Medicine Name and Strength <span className="cho-required">*</span></label>
                <input className="cho-input" type="text" placeholder="e.g., Amoxicillin 500mg"
                  value={name} onChange={e => setName(e.target.value)} />
              </div>

              <div className="cho-form-field">
                <label className="cho-label">Category</label>
                <input className="cho-input" type="text" placeholder="e.g., Antibiotic, Vaccine, Maternal Care"
                  value={subCategory} onChange={e => setSubCategory(e.target.value)} />
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

      {/* Let the catalog table expand to fit every row and scroll with the
          page, instead of being boxed into its own internal scrollbar. */}
      <style>{`
        .cho-table-wrapper {
          max-height: none !important;
          height: auto !important;
          overflow-y: visible !important;
          overflow-x: visible !important;
        }

        /* Fit every column inside the card: no horizontal slider */
        .cho-item-table {
          width: 100% !important;
          min-width: 0 !important;
          table-layout: fixed !important;
        }
        .cho-item-table th,
        .cho-item-table td {
          padding: 10px 8px !important;
          font-size: 12.5px !important;
          line-height: 1.35 !important;
          white-space: normal !important;
          overflow-wrap: anywhere;
          vertical-align: middle;
        }
        .cho-item-table th { font-size: 10.5px !important; vertical-align: top; }
        .cho-item-table .cho-subcategory-pill {
          display: inline-block;
          padding: 3px 8px;
          font-size: 11px;
          white-space: normal;
        }
        .cho-th-label { margin-bottom: 6px; }
        .cho-th-filter {
          width: 100%;
          min-width: 90px;
          padding: 4px 6px;
          font-size: 12px;
          font-weight: 400;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: #fff;
          color: #111827;
          box-sizing: border-box;
        }
        .cho-th-clear {
          padding: 4px 8px;
          font-size: 12px;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          background: #fff;
          color: #2563eb;
          cursor: pointer;
          white-space: nowrap;
        }
      `}</style>
    </div>
  );
}