import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, where, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { runExpiryChecks } from "../../utils/expiryNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./RHUInventory.css";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"     },
  { label: "Inventory",     to: "/rhu/inventory"     },
  { label: "Barangay",      to: "/rhu/barangay"      },
  { label: "Distribution",  to: "/rhu/distribution"  },
  { label: "Reports",       to: "/rhu/reports"       },
  { label: "Messages",      to: "/rhu/messages"      },
  { label: "Notifications", to: "/rhu/notifications" },
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
  const unreadCount = useUnreadCount();

  const [search, setSearch] = useState("");
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState("active"); // "active" | "pending"

  // Add Item modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [productName, setProductName] = useState("");
  const [lotNumber, setLotNumber] = useState("");
  const [category, setCategory] = useState("General Consumption");
  const [subCategory, setSubCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [tabletsPerBox, setTabletsPerBox] = useState("");
  const [source, setSource] = useState("");
  const [expiry, setExpiry] = useState("");

  // Accept modal
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [receivedBy, setReceivedBy] = useState("");
  const [dateReceived, setDateReceived] = useState("");
  const [processingAction, setProcessingAction] = useState(false);

  // Decline modal
  const [showDeclineModal, setShowDeclineModal] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadInventory(); }, [userData]);

  async function loadInventory() {
    setLoading(true);
    try {
      const baseQuery = query(
        collection(db, "inventory"),
        where("ownerType", "==", "rhu")
      );

      const snap = await getDocs(baseQuery);
      
      const userRhuId = String(userData?.rhuId || "").trim().toLowerCase();
      const userRhuName = String(userData?.rhuName || "").trim().toLowerCase();

      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => {
          const itemRhuId = String(item.rhuId || "").trim().toLowerCase();
          const itemRhuName = String(item.rhuName || item.assignedRhu || "").trim().toLowerCase();

          const matchesId = userRhuId !== "" && itemRhuId === userRhuId;
          const matchesName = userRhuName !== "" && itemRhuName === userRhuName;

          return matchesId || matchesName;
        });

      setInventory(list);
      
      const acceptedItems = list.filter(i => {
        const status = String(i.receivedStatus || "").trim().toLowerCase();
        return status === "accepted" || status === "received";
      });
      runExpiryChecks(acceptedItems, "rhu", { rhuId: userData?.rhuId, rhuName: userData?.rhuName });
    } catch (err) { 
      console.error("Error loading RHU inventory:", err); 
    }
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
      const trimmedName = productName.trim();

      const existing = activeInventory.find(
        i => i.name.trim().toLowerCase() === trimmedName.toLowerCase()
      );

      if (existing) {
        const newQuantity  = (existing.quantity  ?? 0) + qty;
        const newRemaining = (existing.remaining ?? 0) + qty;
        await updateDoc(doc(db, "inventory", existing.id), {
          quantity:  newQuantity,
          remaining: newRemaining,
          tabletsPerBox: parseInt(tabletsPerBox) || existing.tabletsPerBox || 30,
          expiry, source, category, subCategory,
          lotNumber: lotNumber.trim(),
        });
        alert(`${trimmedName} already exists — added ${qty} boxes to existing stock (new total: ${newRemaining} boxes).`);
      } else {
        await addDoc(collection(db, "inventory"), {
          productKey: generateProductKey(),
          name: trimmedName,
          lotNumber: lotNumber.trim(),
          category,
          subCategory,
          quantity: qty,
          remaining: qty,
          tabletsPerBox: parseInt(tabletsPerBox) || 30,
          source: source || "Manual Addition",
          expiry,
          ownerType: "rhu",
          receivedStatus: "Accepted",
          rhuId: userData?.rhuId || "",
          rhuName: userData?.rhuName || "",
          createdBy: user?.uid || "",
          createdAt: serverTimestamp(),
        });
        alert("Item saved successfully!");
      }

      setProductName(""); setLotNumber(""); setCategory("General Consumption");
      setSubCategory(""); setQuantity(""); setTabletsPerBox(""); setSource(""); setExpiry("");
      setShowAddModal(false);
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  async function deleteItem(id) {
    if (!confirm("Delete this item?")) return;
    try {
      await deleteDoc(doc(db, "inventory", id));
      setInventory(prev => prev.filter(i => i.id !== id));
    } catch (err) { alert("Error: " + err.message); }
  }

  function openAcceptModal(item) {
    setSelectedItem(item);
    setReceivedBy(userData?.username || "");
    setDateReceived(new Date().toISOString().split("T")[0]);
    setShowAcceptModal(true);
  }

  function openDeclineModal(item) {
    setSelectedItem(item);
    setDeclineReason("");
    setShowDeclineModal(true);
  }

  async function handleAccept() {
    if (!receivedBy.trim()) {
      alert("Please enter the name of the person receiving the supply.");
      return;
    }
    setProcessingAction(true);
    try {
      await updateDoc(doc(db, "inventory", selectedItem.id), {
        receivedStatus: "Accepted",
        receivedBy: receivedBy.trim(),
        receivedAt: dateReceived,
      });

      await addDoc(collection(db, "notifications"), {
        type: "shipment_accepted",
        title: "Supply Shipment Accepted",
        message: `${userData?.rhuName || "RHU"} accepted ${selectedItem.quantity} boxes of ${selectedItem.name}. Received by ${receivedBy.trim()}.`,
        fromRhuName: userData?.rhuName || "",
        fromRhuId: userData?.rhuId || "",
        read: false,
        createdAt: serverTimestamp()
      });

      alert("Shipment accepted and added to active inventory!");
      setShowAcceptModal(false);
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setProcessingAction(false);
  }

  async function handleDecline() {
    setProcessingAction(true);
    try {
      await updateDoc(doc(db, "inventory", selectedItem.id), {
        receivedStatus: "Declined",
        declineReason: declineReason.trim() || "No reason provided",
        declinedAt: serverTimestamp()
      });

      await addDoc(collection(db, "notifications"), {
        type: "shipment_declined",
        title: "Supply Shipment Declined",
        message: `${userData?.rhuName || "RHU"} declined shipment of ${selectedItem.name} (${selectedItem.quantity} boxes). Reason: ${declineReason.trim() || "None"}`,
        fromRhuName: userData?.rhuName || "",
        fromRhuId: userData?.rhuId || "",
        read: false,
        createdAt: serverTimestamp()
      });

      alert("Shipment declined.");
      setShowDeclineModal(false);
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setProcessingAction(false);
  }

  const activeInventory = inventory.filter(i => {
    const status = String(i.receivedStatus || "").trim().toLowerCase();
    return status === "accepted" || status === "received";
  });

  const pendingInventory = inventory.filter(i => {
    const status = String(i.receivedStatus || "").trim().toLowerCase();
    return status === "" || status === "pending";
  });

  const displayList = (activeTab === "active" ? activeInventory : pendingInventory).filter(item =>
    item.name?.toLowerCase().includes(search.toLowerCase())
  );

  const lowStockCount = activeInventory.filter(i => (i.remaining ?? i.quantity) <= 50 && (i.remaining ?? i.quantity) > 20).length;
  const criticalCount = activeInventory.filter(i => (i.remaining ?? i.quantity) <= 20).length;
  const pendingCount  = pendingInventory.length;
  const expiringCount = activeInventory.filter(i => {
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
              <span>{item.label}</span>
              {item.label === "Notifications" && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount}</span>
              )}
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
          </div>

          <div className="rhu-stats-grid rhu-stats-grid--5">
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">ACTIVE ITEMS</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{activeInventory.length}</span></div>
            </div>
            <div className={`rhu-stat-card ${pendingCount > 0 ? "rhu-stat--blue" : ""}`} onClick={() => setActiveTab("pending")} style={{ cursor: "pointer" }}>
              <p className="rhu-stat-label">PENDING ACCEPTANCE</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{pendingCount}</span></div>
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
              <p className="rhu-stat-label">TOTAL BOXES</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">{activeInventory.reduce((s, i) => s + (i.remaining ?? i.quantity ?? 0), 0)}</span>
              </div>
            </div>
          </div>

          <div className="midwife-tabs" style={{ display: "flex", gap: "1rem", marginBottom: "1.25rem", borderBottom: "1px solid #e2e8f0", paddingBottom: "0.5rem" }}>
            <button 
              className={`midwife-tab-btn ${activeTab === "active" ? "active" : ""}`}
              onClick={() => setActiveTab("active")}
              style={{
                background: "none", border: "none", fontWeight: activeTab === "active" ? "bold" : "normal",
                borderBottom: activeTab === "active" ? "2px solid #1a56db" : "none",
                color: activeTab === "active" ? "#1a56db" : "#64748b", padding: "0.5rem 1rem", cursor: "pointer"
              }}
            >
              Active Stock ({activeInventory.length})
            </button>
            <button 
              className={`midwife-tab-btn ${activeTab === "pending" ? "active" : ""}`}
              onClick={() => setActiveTab("pending")}
              style={{
                background: "none", border: "none", fontWeight: activeTab === "pending" ? "bold" : "normal",
                borderBottom: activeTab === "pending" ? "2px solid #1a56db" : "none",
                color: activeTab === "pending" ? "#1a56db" : "#64748b", padding: "0.5rem 1rem", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "0.5rem"
              }}
            >
              Pending Shipments
              {pendingCount > 0 && (
                <span style={{ background: "#dc2626", color: "#fff", borderRadius: "9999px", fontSize: "0.75rem", padding: "0.1rem 0.5rem" }}>
                  {pendingCount}
                </span>
              )}
            </button>
          </div>

          <div className="rhu-inv-toolbar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.25rem", flexWrap: "wrap", gap: "1rem" }}>
            <div className="rhu-inv-search-wrap" style={{ flex: 1, minWidth: "240px" }}>
              <input
                className="rhu-search"
                type="text"
                placeholder="Search Medicine"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: "100%" }}
              />
            </div>
            <div className="rhu-inv-toolbar-right" style={{ display: "flex", gap: "10px" }}>
              <button className="rhu-btn-primary" onClick={() => setShowAddModal(true)}>+ Add New Item</button>
            </div>
          </div>

          {loading ? (
            <div className="rhu-empty-state"><p>Loading inventory...</p></div>
          ) : displayList.length === 0 ? (
            <div className="rhu-empty-state">
              <div className="rhu-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <h2 className="rhu-empty-title">
                {activeTab === "active" ? "No Active Inventory Items" : "No Pending Shipments"}
              </h2>
              <p className="rhu-empty-text">
                {activeTab === "active" 
                  ? "Add supplies manually or accept pending shipments from CHO." 
                  : "New incoming supply shipments from CHO will show up here for review."}
              </p>
            </div>
          ) : (
            <section className="rhu-inv-section">
              <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table className="rhu-inv-table">
                  <thead>
                    <tr>
                      <th>PRODUCT KEY</th>
                      <th>ITEM NAME</th>
                      <th>LOT #</th>
                      <th>CATEGORY</th>
                      <th>SUB-CATEGORY</th>
                      <th>QUANTITY</th>
                      <th>REMAINING</th>
                      <th>EXPIRY</th>
                      <th>STATUS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayList.map(item => {
                      const remaining = item.remaining ?? item.quantity;
                      const isPending = activeTab === "pending";

                      return (
                        <tr key={item.id}>
                          <td className="rhu-product-key">{item.productKey || "—"}</td>
                          <td><strong>{item.name}</strong></td>
                          <td className="rhu-product-key">{item.lotNumber || "—"}</td>
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
                            {isPending ? (
                              <span className="rhu-inv-status-badge rhu-status--low">
                                Pending
                              </span>
                            ) : (
                              <span className={`rhu-inv-status-badge ${getStatusClass(remaining)}`}>
                                <span className={`rhu-status-dot rhu-dot--${getStatus(remaining).toLowerCase()}`} />
                                {getStatus(remaining)}
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="rhu-action-group">
                              {isPending && (
                                <button className="rhu-btn-action rhu-btn-distribute" onClick={() => openAcceptModal(item)}>
                                  Accept
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

      {showAddModal && (
        <div className="rhu-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="rhu-modal rhu-modal--md" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Add New Inventory Item</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <h3 className="rhu-form-section-title">Basic Information</h3>
              <div className="rhu-form-field">
                <label className="rhu-label">Product Name <span className="rhu-required">*</span></label>
                <input className="rhu-input" type="text" placeholder="e.g., Amoxicillin 500mg Tablet"
                  value={productName} onChange={e => setProductName(e.target.value)} />
              </div>
              <div className="rhu-form-row rhu-form-row--3">
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
                <div className="rhu-form-field">
                  <label className="rhu-label">Lot Number</label>
                  <input className="rhu-input" type="text" placeholder="e.g., LOT-2026-0143"
                    value={lotNumber} onChange={e => setLotNumber(e.target.value)} />
                </div>
              </div>

              <h3 className="rhu-form-section-title">Stock Details</h3>
              <div className="rhu-form-row">
                <div className="rhu-form-field">
                  <label className="rhu-label">Quantity (boxes) <span className="rhu-required">*</span></label>
                  <input className="rhu-input" type="number" placeholder="e.g., 100"
                    value={quantity} onChange={e => setQuantity(e.target.value)} />
                </div>
                <div className="rhu-form-field">
                  <label className="rhu-label">Tablets per Box <span className="rhu-required">*</span></label>
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
                  <label className="rhu-label">Expiry Date <span className="rhu-required">*</span></label>
                  <input className="rhu-input" type="date"
                    value={expiry} onChange={e => setExpiry(e.target.value)} />
                </div>
              </div>
              <p className="rhu-form-hint"><span className="rhu-required">*</span> Required fields</p>
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

      {showAcceptModal && selectedItem && (
        <div className="rhu-modal-overlay" onClick={() => setShowAcceptModal(false)}>
          <div className="rhu-modal" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Accept Supply Shipment</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => setShowAcceptModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <p className="rhu-dist-note">
                Confirming acceptance of <strong>{selectedItem.quantity} boxes</strong> of <strong>{selectedItem.name}</strong>
                {selectedItem.lotNumber ? ` (Lot ${selectedItem.lotNumber})` : ""} sent by CHO.
              </p>
              <div className="rhu-form-field">
                <label className="rhu-label">Received By <span className="rhu-required">*</span></label>
                <input className="rhu-input" type="text" placeholder="Name of person accepting supply"
                  value={receivedBy} onChange={e => setReceivedBy(e.target.value)} />
              </div>
              <div className="rhu-form-field">
                <label className="rhu-label">Date Received</label>
                <input className="rhu-input" type="date"
                  value={dateReceived} onChange={e => setDateReceived(e.target.value)} />
              </div>
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setShowAcceptModal(false)}>Cancel</button>
              <button className="rhu-btn-primary" onClick={handleAccept} disabled={processingAction}>
                {processingAction ? "Accepting..." : "Accept Shipment"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeclineModal && selectedItem && (
        <div className="rhu-modal-overlay" onClick={() => setShowDeclineModal(false)}>
          <div className="rhu-modal" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Decline Supply Shipment</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => setShowDeclineModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <p className="rhu-dist-note">
                Are you sure you want to decline <strong>{selectedItem.quantity} boxes</strong> of <strong>{selectedItem.name}</strong>?
              </p>
              <div className="rhu-form-field">
                <label className="rhu-label">Reason for Declining</label>
                <textarea 
                  className="rhu-input" 
                  rows="3" 
                  placeholder="e.g., Damaged boxes, incorrect item, expired..."
                  value={declineReason} 
                  onChange={e => setDeclineReason(e.target.value)} 
                />
              </div>
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setShowDeclineModal(false)}>Cancel</button>
              <button className="rhu-btn-action rhu-btn-del" onClick={handleDecline} disabled={processingAction} style={{ padding: "10px 18px", borderRadius: "8px" }}>
                {processingAction ? "Declining..." : "Decline Shipment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}