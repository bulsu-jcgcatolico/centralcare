import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  collection, addDoc, getDocs, doc, deleteDoc,
  serverTimestamp, query, where, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { checkAndNotifyLowStock } from "../../utils/lowStockNotifier";
import { runExpiryChecks } from "../../utils/expiryNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { FHSIS_ANTIGENS, FHSIS_ANTIGEN_ORDER } from "../../utils/fhsisImmunization";
import {
  getPriorMonthKey, monthKeyLabel, hasSubmittedBalance,
  buildBalanceItemsFromInventory, submitBalanceReport,
} from "../../utils/monthlyBalance";
import "./MidwifeInventory.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "BHW & Campaigns", to: "/midwife/bhw"        },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
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
  if (remaining <= 20) return "midwife-status--critical";
  if (remaining <= 50) return "midwife-status--low";
  return "midwife-status--good";
}

export default function MidwifeInventory() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const { showToast } = useToast();

  const [inventory, setInventory]   = useState([]);
  const [loading, setLoading]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [search, setSearch]         = useState("");
  const [activeTab, setActiveTab]   = useState("active"); // "active" | "pending"

  // Log New Shipment modal
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [shipProductName, setShipProductName]     = useState("");
  const [shipLotNumber, setShipLotNumber]         = useState("");
  const [shipCategory, setShipCategory]           = useState("General Consumption");
  const [shipSubCategory, setShipSubCategory]     = useState("");
  const [shipBoxes, setShipBoxes]                 = useState("");
  const [shipExpiry, setShipExpiry]               = useState("");
  const [shipSource, setShipSource]               = useState("");
  const [shipIsVaccine, setShipIsVaccine]         = useState(false);
  const [shipDoseType, setShipDoseType]           = useState("single");
  const [shipDosesPerVial, setShipDosesPerVial]   = useState("");
  const [shipFhsisAntigen, setShipFhsisAntigen]   = useState("other");

  // "Present End Balance" monthly report — mandatory before this barangay's
  // RHU will replenish it again.
  const [showBalanceModal, setShowBalanceModal] = useState(false);
  const [balanceAlreadySubmitted, setBalanceAlreadySubmitted] = useState(false);
  const [checkingBalance, setCheckingBalance] = useState(true);
  const [submittingBalance, setSubmittingBalance] = useState(false);
  const reportMonthKey = getPriorMonthKey();

  // Confirm Receipt modal
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receivingItem, setReceivingItem]       = useState(null);
  const [receivedBy, setReceivedBy]             = useState("");
  const [dateReceived, setDateReceived]         = useState("");
  const [receiving, setReceiving]               = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadInventory(); }, [userData]);
  useEffect(() => { checkBalanceStatus(); }, [userData]);

  const ownerBarangayId = userData?.barangayName || userData?.barangay || "";

  async function checkBalanceStatus() {
    if (!ownerBarangayId) return;
    setCheckingBalance(true);
    try {
      const submitted = await hasSubmittedBalance("midwife", ownerBarangayId, reportMonthKey);
      setBalanceAlreadySubmitted(submitted);
    } catch (err) { console.error("Error checking balance report status:", err); }
    setCheckingBalance(false);
  }

  async function handleSubmitBalanceReport() {
    setSubmittingBalance(true);
    try {
      const items = buildBalanceItemsFromInventory(activeInventory);
      await submitBalanceReport({
        ownerType: "midwife",
        ownerId: ownerBarangayId,
        ownerName: ownerBarangayId,
        monthKey: reportMonthKey,
        items,
        submittedBy: userData?.username || "",
      });
      showToast(`${monthKeyLabel(reportMonthKey)} end balance report submitted. Your RHU can now review it before your next replenishment.`, "success");
      setBalanceAlreadySubmitted(true);
      setShowBalanceModal(false);
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSubmittingBalance(false);
  }

  async function loadInventory() {
    setLoading(true);
    try {
      const baseQuery = query(
        collection(db, "inventory"),
        where("ownerType", "==", "midwife")
      );
      
      const snap = await getDocs(baseQuery);
      const userBarangay = String(userData?.barangayName || userData?.barangay || "").toLowerCase();

      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => {
          const itemBarangay = String(item.barangayName || item.barangay || "").toLowerCase();
          return userBarangay && itemBarangay === userBarangay;
        });

      setInventory(list);
      
      // Run expiry checks strictly on active/received items
      const activeItems = list.filter(i => {
        const status = String(i.receivedStatus || "").trim().toLowerCase();
        return status === "received" || status === "accepted" || !i.receivedStatus;
      });
      runExpiryChecks(activeItems, "midwife", { barangayName: userData?.barangayName });
    } catch (err) { 
      console.error("Error loading Midwife inventory:", err); 
    }
    setLoading(false);
  }

  async function saveShipment() {
    if (!shipProductName.trim() || !shipBoxes || !shipExpiry) {
      showToast("Please fill in Product Name, Boxes, and Expiry Date", "error");
      return;
    }
    setSaving(true);
    try {
      const boxes = parseInt(shipBoxes);
      const trimmedName = shipProductName.trim();
      const trimmedLot = shipLotNumber.trim();

      // Only treat this as "the same batch" if name, lot number, AND expiry date all
      // match exactly — matching on name alone would silently merge different batches
      // (different lot / expiry) and overwrite the row's expiry/lot info.
      const existing = activeInventory.find(
        i => i.name.trim().toLowerCase() === trimmedName.toLowerCase()
          && (i.lotNumber || "").trim().toLowerCase() === trimmedLot.toLowerCase()
          && i.expiry === shipExpiry
      );

      if (existing) {
        const newQuantity  = (existing.quantity  ?? 0) + boxes;
        const newRemaining = (existing.remaining ?? 0) + boxes;
        await updateDoc(doc(db, "inventory", existing.id), {
          quantity:  newQuantity,
          remaining: newRemaining,
        });
        showToast(`${trimmedName} (Lot ${trimmedLot || "—"}, same expiry) already exists — added ${boxes} boxes to existing stock (new total: ${newRemaining} boxes).`, "success");
      } else {
        await addDoc(collection(db, "inventory"), {
          productKey:    generateProductKey(),
          name:          trimmedName,
          lotNumber:     shipLotNumber.trim(),
          category:      shipCategory,
          subCategory:   shipSubCategory.trim(),
          quantity:      boxes,
          remaining:     boxes,
          expiry:        shipExpiry,
          source:        shipSource || "Manual Log",
          ownerType:     "midwife",
          receivedStatus: "Received", // Manual entries default to active/received
          barangayName:  userData?.barangayName || userData?.barangay || "",
          isVaccine:     shipIsVaccine,
          doseType:      shipIsVaccine ? shipDoseType : "",
          dosesPerVial:  shipIsVaccine && shipDoseType === "multi" ? (parseInt(shipDosesPerVial) || 1) : (shipIsVaccine ? 1 : 0),
          fhsisAntigen:  shipIsVaccine ? shipFhsisAntigen : "",
          createdAt:     serverTimestamp(),
        });
        showToast("Shipment logged successfully!", "success");
      }

      setShipProductName(""); setShipLotNumber(""); setShipCategory("General Consumption");
      setShipSubCategory(""); setShipBoxes(""); setShipExpiry(""); setShipSource("");
      setShipIsVaccine(false); setShipDoseType("single"); setShipDosesPerVial(""); setShipFhsisAntigen("other");
      setShowShipmentModal(false);
      loadInventory();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSaving(false);
  }

  function openReceiveModal(item) {
    setReceivingItem(item);
    setReceivedBy("");
    setDateReceived(new Date().toISOString().split("T")[0]);
    setShowReceiveModal(true);
  }

  async function confirmReceipt() {
    if (!receivedBy.trim()) {
      showToast("Please enter the name of the person confirming receipt.", "error");
      return;
    }
    setReceiving(true);
    try {
      await updateDoc(doc(db, "inventory", receivingItem.id), {
        receivedStatus: "Received",
        receivedBy: receivedBy.trim(),
        receivedAt: dateReceived,
      });
      setShowReceiveModal(false);
      showToast("Receipt confirmed — thank you!", "success");
      loadInventory();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setReceiving(false);
  }

  // Strict Split: Active vs Pending
  const activeInventory = inventory.filter(i => {
    const status = String(i.receivedStatus || "").trim().toLowerCase();
    return status === "received" || status === "accepted" || !i.receivedStatus;
  });

  const pendingInventory = inventory.filter(i => {
    const status = String(i.receivedStatus || "").trim().toLowerCase();
    return status === "pending" || status === ""; // depending on backend setup, treating blank/pending safely
  });

  // For the actual table rows rendered
  const currentList = activeTab === "active" ? activeInventory : pendingInventory;
  const filtered = currentList
    .filter(i => i.name?.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      // Only reorder within Active Stock — pending shipments don't have a
      // "depleted" concept, so leave that tab's order untouched.
      if (activeTab !== "active") return 0;
      const remA = a.remaining ?? a.quantity ?? 0;
      const remB = b.remaining ?? b.quantity ?? 0;
      const aDepleted = remA <= 0;
      const bDepleted = remB <= 0;
      if (aDepleted !== bDepleted) return aDepleted ? 1 : -1; // depleted sinks to bottom
      return 0; // preserve existing relative order otherwise
    });

  const lowStockCount   = activeInventory.filter(i => (i.remaining ?? 0) <= 50 && (i.remaining ?? 0) > 20).length;
  const criticalCount   = activeInventory.filter(i => (i.remaining ?? 0) <= 20).length;
  const pendingReceiptCount = inventory.filter(i => {
    const status = String(i.receivedStatus || "").trim().toLowerCase();
    return status === "pending" || status === "";
  }).length;
  const expiringCount   = activeInventory.filter(i => {
    if (!i.expiry) return false;
    const days = (new Date(i.expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= 30 && days >= 0;
  }).length;

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
              {item.label === "Notifications" && Boolean(unreadCount) && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="midwife-sidebar-footer">
          <NavLink to="/midwife/settings" className="midwife-nav-item midwife-nav-btn">Settings</NavLink>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

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

          <div className="midwife-inv-stats-row">
            <div className="midwife-inv-stat-card">
              <div className="midwife-inv-stat-icon midwife-inv-icon--blue">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-inv-stat-label">Active Items</p>
                <p className="midwife-inv-stat-value">{activeInventory.length}</p>
              </div>
            </div>
            <div className="midwife-inv-stat-card" onClick={() => setActiveTab("pending")} style={{ cursor: "pointer" }}>
              <div className="midwife-inv-stat-icon midwife-inv-icon--blue">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
                  <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <div>
                <p className="midwife-inv-stat-label">Pending Receipt</p>
                <p className="midwife-inv-stat-value">{pendingReceiptCount}</p>
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

          {/* Tab Navigation */}
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
              {pendingReceiptCount > 0 && (
                <span style={{ background: "#dc2626", color: "#fff", borderRadius: "9999px", fontSize: "0.75rem", padding: "0.1rem 0.5rem" }}>
                  {pendingReceiptCount}
                </span>
              )}
            </button>
          </div>

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
              <button className="midwife-btn-primary" onClick={() => navigate("/midwife/dispense")}>
                Dispense Items
              </button>
              <button className="midwife-btn-primary midwife-btn--outline" onClick={() => navigate("/midwife/request-letter")}>
                Request Supplies
              </button>
              <button className="midwife-btn-secondary" onClick={() => setShowShipmentModal(true)}>
                Log New Shipment
              </button>
              <button
                className="midwife-btn-secondary"
                onClick={() => setShowBalanceModal(true)}
                disabled={checkingBalance || balanceAlreadySubmitted}
                title={balanceAlreadySubmitted ? `${monthKeyLabel(reportMonthKey)} report already submitted` : ""}
              >
                {balanceAlreadySubmitted ? `✓ ${monthKeyLabel(reportMonthKey)} Balance Submitted` : `Submit ${monthKeyLabel(reportMonthKey)} End Balance`}
              </button>
              <button className="midwife-btn-secondary" onClick={() => showToast("CSV export isn't built yet — coming soon.", "info")}>
                Export
              </button>
            </div>
          </div>

          {!checkingBalance && !balanceAlreadySubmitted && (
            <div className="midwife-empty-state" style={{ background: "#fff7ed", border: "1px solid #fed7aa", padding: "12px 16px", marginBottom: "1.25rem", textAlign: "left" }}>
              <p style={{ margin: 0, color: "#9a3412", fontWeight: 600 }}>
                Present End Balance report for {monthKeyLabel(reportMonthKey)} is missing.
              </p>
              <p style={{ margin: "4px 0 0", color: "#9a3412", fontSize: "0.9rem" }}>
                Your RHU won't include this barangay in the next replenishment split until this month-end movement report is submitted.
              </p>
            </div>
          )}

          {loading ? (
            <div className="midwife-empty-state"><p>Loading inventory...</p></div>
          ) : filtered.length === 0 ? (
            <div className="midwife-empty-state">
              <div className="midwife-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <h2 className="midwife-empty-title">
                {activeTab === "active" ? "No Active Inventory Items Yet" : "No Pending Shipments"}
              </h2>
              <p className="midwife-empty-text">
                {activeTab === "active" 
                  ? "Log a new shipment or accept pending supplies from your RHU." 
                  : "Incoming distributions from the RHU will appear here for confirmation."}
              </p>
              {activeTab === "active" && (
                <button className="midwife-btn-primary" onClick={() => setShowShipmentModal(true)}>
                  Log New Shipment
                </button>
              )}
            </div>
          ) : (
            <section className="midwife-inv-section" style={{ flexShrink: 0 }}>
              <div className="midwife-inv-scroll-box" style={{ width: "100%", maxHeight: "480px", overflowY: "auto", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table className="midwife-table">
                <colgroup>
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "6%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>PRODUCT KEY</th>
                    <th>PRODUCT NAME</th>
                    <th>LOT #</th>
                    <th>CATEGORY</th>
                    <th>SUB-CATEGORY</th>
                    <th>QUANTITY</th>
                    <th>REMAINING</th>
                    <th>EXPIRY</th>
                    <th>STATUS</th>
                    <th>RECEIPT</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const remaining = item.remaining ?? item.quantity;
                    const isPending = activeTab === "pending";

                    return (
                      <tr key={item.id}>
                        <td className="midwife-product-key">{item.productKey || "—"}</td>
                        <td><strong>{item.name}</strong></td>
                        <td className="midwife-product-key">{item.lotNumber || "—"}</td>
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
                          {isPending ? (
                            <span className="midwife-status-badge midwife-status--low">Pending</span>
                          ) : (
                            <span className={`midwife-status-badge ${getStatusClass(remaining)}`}>
                              <span className={`midwife-status-dot midwife-dot--${getStatus(remaining).toLowerCase()}`} />
                              {getStatus(remaining)}
                            </span>
                          )}
                        </td>
                        <td>
                          {isPending || item.receivedStatus === "Pending" ? (
                            <span className="midwife-status-badge midwife-status--low">Pending</span>
                          ) : (
                            <span className="midwife-status-badge midwife-status--good">Received</span>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: "6px" }}>
                            {isPending && (
                              <button className="midwife-btn-icon" onClick={() => openReceiveModal(item)}>
                                Receive
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

      {/* Modal */}
      {showShipmentModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowShipmentModal(false)}>
          <div className="midwife-modal midwife-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">Log New Shipment</h2>
              <button className="midwife-modal-close" aria-label="Close" onClick={() => setShowShipmentModal(false)}>×</button>
            </div>
            <div className="midwife-modal-body">

              <h3 className="midwife-form-section-title">Basic Information</h3>
              <div className="midwife-form-field">
                <label className="midwife-label">Product Name <span className="midwife-required">*</span></label>
                <input className="midwife-input" type="text" placeholder="e.g., Amoxicillin 500mg Tablet"
                  value={shipProductName} onChange={e => setShipProductName(e.target.value)} />
              </div>
              <div className="midwife-form-row midwife-form-row--3">
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
                <div className="midwife-form-field">
                  <label className="midwife-label">Lot Number</label>
                  <input className="midwife-input" type="text" placeholder="e.g., LOT-2026-0143"
                    value={shipLotNumber} onChange={e => setShipLotNumber(e.target.value)} />
                </div>
              </div>

              <h3 className="midwife-form-section-title">Stock Details</h3>
              <div className="midwife-form-row midwife-form-row--3">
                <div className="midwife-form-field">
                  <label className="midwife-label">Boxes Received (30's) <span className="midwife-required">*</span></label>
                  <input className="midwife-input" type="number" placeholder="e.g., 20"
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
                  <label className="midwife-label">Expiry Date <span className="midwife-required">*</span></label>
                  <input className="midwife-input" type="date"
                    value={shipExpiry} onChange={e => setShipExpiry(e.target.value)} />
                </div>
              </div>

              <h3 className="midwife-form-section-title">Vaccine Classification</h3>
              <div className="midwife-form-field">
                <label className="midwife-label" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" checked={shipIsVaccine} onChange={e => setShipIsVaccine(e.target.checked)} />
                  This item is a vaccine (tracked in vials, not boxes)
                </label>
              </div>
              {shipIsVaccine && (
                <div className="midwife-form-row">
                  <div className="midwife-form-field">
                    <label className="midwife-label">Dose Type</label>
                    <select className="midwife-input" value={shipDoseType} onChange={e => setShipDoseType(e.target.value)}>
                      <option value="single">Single-dose (1 vial = 1 dose)</option>
                      <option value="multi">Multi-dose (vial holds several doses)</option>
                    </select>
                  </div>
                  {shipDoseType === "multi" && (
                    <div className="midwife-form-field">
                      <label className="midwife-label">Doses per Vial</label>
                      <input className="midwife-input" type="number" min="1" placeholder="e.g., 10"
                        value={shipDosesPerVial} onChange={e => setShipDosesPerVial(e.target.value)} />
                    </div>
                  )}
                  <div className="midwife-form-field">
                    <label className="midwife-label">FHSIS Antigen Category</label>
                    <select className="midwife-input" value={shipFhsisAntigen} onChange={e => setShipFhsisAntigen(e.target.value)}>
                      {FHSIS_ANTIGEN_ORDER.map(key => (
                        <option key={key} value={key}>{FHSIS_ANTIGENS[key].label}</option>
                      ))}
                      <option value="other">{FHSIS_ANTIGENS.other.label}</option>
                    </select>
                  </div>
                </div>
              )}
              <p className="midwife-form-hint"><span className="midwife-required">*</span> Required fields</p>
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

      {showReceiveModal && receivingItem && (
        <div className="midwife-modal-overlay" onClick={() => setShowReceiveModal(false)}>
          <div className="midwife-modal" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">Confirm Receipt</h2>
              <button className="midwife-modal-close" aria-label="Close" onClick={() => setShowReceiveModal(false)}>×</button>
            </div>
            <div className="midwife-modal-body">
              <p className="midwife-input-hint" style={{ marginBottom: "1rem" }}>
                Confirming that <strong>{receivingItem.quantity} boxes</strong> of <strong>{receivingItem.name}</strong>
                {receivingItem.lotNumber ? ` (Lot ${receivingItem.lotNumber})` : ""} were physically received from {receivingItem.source === "RHU" ? receivingItem.fromRhuName || "RHU" : receivingItem.source}.
              </p>
              <div className="midwife-form-field">
                <label className="midwife-label">Received By <span className="midwife-required">*</span></label>
                <input className="midwife-input" type="text" placeholder="Name of person confirming receipt"
                  value={receivedBy} onChange={e => setReceivedBy(e.target.value)} />
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Date Received</label>
                <input className="midwife-input" type="date"
                  value={dateReceived} onChange={e => setDateReceived(e.target.value)} />
              </div>
              <p className="midwife-form-hint"><span className="midwife-required">*</span> Required fields</p>
            </div>
            <div className="midwife-modal-footer">
              <button className="midwife-btn-secondary" onClick={() => setShowReceiveModal(false)}>Cancel</button>
              <button className="midwife-btn-primary" onClick={confirmReceipt} disabled={receiving}>
                {receiving ? "Confirming..." : "Confirm Receipt"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBalanceModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowBalanceModal(false)}>
          <div className="midwife-modal midwife-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">Present End Balance — {monthKeyLabel(reportMonthKey)}</h2>
              <button className="midwife-modal-close" aria-label="Close" onClick={() => setShowBalanceModal(false)}>×</button>
            </div>
            <div className="midwife-modal-body">
              <p className="midwife-input-hint" style={{ marginBottom: "0.75rem" }}>
                This snapshot of {activeInventory.length} active item(s) — opening stock, amount dispensed, and end balance —
                goes to your RHU so they can review slow-moving stock before approving your next replenishment.
              </p>
              <div style={{ maxHeight: "360px", overflowY: "auto", overflowX: "hidden", border: "1px solid #e5e7eb", borderRadius: "8px" }}>
                <table className="midwife-table" style={{ width: "100%", tableLayout: "fixed" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "36%" }}>Item</th>
                      <th style={{ width: "14%" }}>Opening</th>
                      <th style={{ width: "16%" }}>Dispensed</th>
                      <th style={{ width: "16%" }}>End Balance</th>
                      <th style={{ width: "18%" }}>Movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {buildBalanceItemsFromInventory(activeInventory).map(it => (
                      <tr key={it.itemId}>
                        <td style={{ padding: "8px 10px", wordBreak: "break-word" }}>{it.name}{it.lotNumber ? ` (Lot ${it.lotNumber})` : ""}</td>
                        <td style={{ padding: "8px 10px" }}>{it.openingBalance}</td>
                        <td style={{ padding: "8px 10px" }}>{it.dispensed}</td>
                        <td style={{ padding: "8px 10px" }}><strong>{it.endBalance}</strong></td>
                        <td style={{ padding: "8px 10px", color: it.movementRate < 20 ? "#b91c1c" : "#166534" }}>{it.movementRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="midwife-modal-footer">
              <button className="midwife-btn-secondary" onClick={() => setShowBalanceModal(false)}>Cancel</button>
              <button className="midwife-btn-primary" onClick={handleSubmitBalanceReport} disabled={submittingBalance}>
                {submittingBalance ? "Submitting..." : "Submit to RHU"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .midwife-inv-scroll-box {
          scrollbar-width: auto;
        }
        .midwife-inv-scroll-box::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .midwife-inv-scroll-box::-webkit-scrollbar-track {
          background: #f3f4f6;
        }
        .midwife-inv-scroll-box::-webkit-scrollbar-thumb {
          background: #9ca3af;
          border-radius: 6px;
          border: 2px solid #f3f4f6;
        }
        .midwife-inv-scroll-box::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }
      `}</style>
    </div>
  );
}