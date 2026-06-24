import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, where, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { checkAndNotifyLowStock } from "../../utils/lowStockNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./RHUDistribution.css";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"      },
  { label: "Inventory",     to: "/rhu/inventory"      },
  { label: "Distribution",  to: "/rhu/distribution"   },
  { label: "Reports",       to: "/rhu/reports"        },
  { label: "Notifications", to: "/rhu/notifications"  },
];

// Default barangay population percentages (editable in the modal)
const DEFAULT_BARANGAYS = [
  { id: 1, name: "Longos",     populationPercent: 0.15 },
  { id: 2, name: "Caingin",    populationPercent: 0.12 },
  { id: 3, name: "Catmon",     populationPercent: 0.18 },
  { id: 4, name: "Bulihan",    populationPercent: 0.10 },
  { id: 5, name: "Guinihawa",  populationPercent: 0.08 },
  { id: 6, name: "Liang",      populationPercent: 0.11 },
  { id: 7, name: "Lugam",      populationPercent: 0.09 },
  { id: 8, name: "Mojon",      populationPercent: 0.10 },
  { id: 9, name: "Bangkal",    populationPercent: 0.07 },
];

export default function RHUDistribution() {
  const { logout, user, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [distributions, setDistributions]   = useState([]);
  const [inventory, setInventory]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [distributingId, setDistributingId] = useState(null);

  // New distribution modal
  const [showNewModal, setShowNewModal]     = useState(false);
  const [selectedInvId, setSelectedInvId]  = useState("");
  const [totalBoxes, setTotalBoxes]         = useState("");
  const [barangays, setBarangays]           = useState(DEFAULT_BARANGAYS);
  const [calculatedDist, setCalculatedDist] = useState([]);

  // Review modal
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewData, setReviewData]           = useState(null);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => {
    loadDistributions();
    loadInventory();
  }, []);

  async function loadInventory() {
    try {
      const q = query(
        collection(db, "inventory"),
        where("ownerType", "==", "rhu"),
        where("rhuId", "==", userData?.rhuId ?? "")
      );
      const snap = await getDocs(q);
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  }

  async function loadDistributions() {
    setLoading(true);
    try {
      const q = query(
        collection(db, "rhu_distributions"),
        where("fromRhuId", "==", userData?.rhuId ?? "")
      );
      const snap = await getDocs(q);
      setDistributions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  // Update a barangay's population percent in the editable table
  function updateBarangayPercent(id, value) {
    setBarangays(barangays.map(b =>
      b.id === id ? { ...b, populationPercent: parseFloat(value) / 100 || 0 } : b
    ));
    setCalculatedDist([]); // reset calc when % changes
  }

  // Auto-calculate boxes per barangay
  function calculateDistribution() {
    const total = parseInt(totalBoxes);
    if (!total || total <= 0) { alert("Enter a valid number of boxes"); return; }
    const item = inventory.find(i => i.id === selectedInvId);
    if (!item) { alert("Please select a medicine"); return; }
    const avail = item.remaining ?? item.quantity;
    if (total > avail) { alert(`Only ${avail} boxes remaining!`); return; }

    const totalPercent = barangays.reduce((s, b) => s + b.populationPercent, 0);
    if (Math.abs(totalPercent - 1) > 0.02) {
      alert(`Population % total is ${(totalPercent * 100).toFixed(0)}% — should equal 100%. Please adjust.`);
      return;
    }

    let rem = total;
    const result = barangays.map((b, i) => {
      const boxes = i === barangays.length - 1
        ? rem
        : Math.round(total * b.populationPercent);
      rem -= boxes;
      return { ...b, boxes, status: "Pending" };
    });
    setCalculatedDist(result);
  }

  // Save plan + deduct inventory + notify all barangays
  async function saveDistributionPlan() {
    if (calculatedDist.length === 0) return;
    setSaving(true);
    try {
      const item = inventory.find(i => i.id === selectedInvId);
      const total = parseInt(totalBoxes);

      // 1. Save distribution record
      const docRef = await addDoc(collection(db, "rhu_distributions"), {
        fromType:             "rhu",
        fromRhuId:            userData?.rhuId  ?? "",
        fromRhuName:          userData?.rhuName ?? "",
        inventoryId:          selectedInvId,
        medicineName:         item.name,
        totalBoxes:           total,
        barangayDistribution: calculatedDist,
        status:               "Pending",
        createdBy:            user?.uid ?? "",
        createdAt:            serverTimestamp(),
        date:                 new Date().toLocaleDateString()
      });

      // 2. Deduct remaining from inventory
      const newRemaining = (item.remaining ?? item.quantity) - total;
      await updateDoc(doc(db, "inventory", selectedInvId), { remaining: newRemaining });
      await checkAndNotifyLowStock({ id: selectedInvId, name: item.name, remaining: newRemaining }, "rhu", userData);

      // 3. Write to barangay_inventory + notify each barangay
      for (const b of calculatedDist) {
        // Create inventory record for midwife to see and dispense from
        await addDoc(collection(db, "inventory"), {
          productKey:    item.productKey ?? "",
          name:          item.name,
          category:      item.category ?? "",
          subCategory:   item.subCategory ?? "",
          quantity:      b.boxes,
          remaining:     b.boxes,
          expiry:        item.expiry ?? "",
          source:        "RHU",
          ownerType:     "midwife",
          barangayName:  b.name,
          fromRhuId:     userData?.rhuId  ?? "",
          fromRhuName:   userData?.rhuName ?? "",
          distributionId: docRef.id,
          createdAt:     serverTimestamp(),
        });

        // Notify barangay midwife
        await addDoc(collection(db, "notifications"), {
          type:           "distribution",
          title:          "New Supply from RHU",
          message:        `${userData?.rhuName} has allocated ${b.boxes} boxes of ${item.name} for ${b.name} barangay.`,
          toBarangayName: b.name,
          fromRhuId:      userData?.rhuId  ?? "",
          fromRhuName:    userData?.rhuName ?? "",
          distributionId: docRef.id,
          read:           false,
          createdAt:      serverTimestamp()
        });
      }

      alert("Distribution plan saved! All barangays have been notified.");
      setShowNewModal(false);
      setSelectedInvId(""); setTotalBoxes(""); setCalculatedDist([]);
      setBarangays(DEFAULT_BARANGAYS);
      loadDistributions();
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  // Mark one barangay row as Distributed + send dispatch notification
  async function distributeToBarangay(dist, barangayId) {
    setDistributingId(barangayId + dist.id);
    try {
      const updated = dist.barangayDistribution.map(b =>
        b.id === barangayId ? { ...b, status: "Distributed" } : b
      );
      const allDone = updated.every(b => b.status === "Distributed");

      await updateDoc(doc(db, "rhu_distributions", dist.id), {
        barangayDistribution: updated,
        status: allDone ? "Completed" : "Partial"
      });

      const b = updated.find(b => b.id === barangayId);
      await addDoc(collection(db, "notifications"), {
        type:           "distribution",
        title:          "Supply Dispatched",
        message:        `Your ${b.boxes} boxes of ${dist.medicineName} have been dispatched by ${userData?.rhuName}.`,
        toBarangayName: b.name,
        fromRhuId:      userData?.rhuId  ?? "",
        fromRhuName:    userData?.rhuName ?? "",
        distributionId: dist.id,
        read:           false,
        createdAt:      serverTimestamp()
      });

      loadDistributions();
    } catch (err) { alert("Error: " + err.message); }
    setDistributingId(null);
  }

  // Distribute to ALL barangays in this plan at once
  async function distributeAllBarangays(dist) {
    if (!confirm(`Distribute ${dist.medicineName} to all ${dist.barangayDistribution.length} barangays now?`)) return;
    setDistributingId("all-" + dist.id);
    try {
      const updated = dist.barangayDistribution.map(b => ({ ...b, status: "Distributed" }));

      await updateDoc(doc(db, "rhu_distributions", dist.id), {
        barangayDistribution: updated,
        status: "Completed"
      });

      for (const b of updated) {
        await addDoc(collection(db, "notifications"), {
          type:           "distribution",
          title:          "Supply Dispatched",
          message:        `Your ${b.boxes} boxes of ${dist.medicineName} have been dispatched by ${userData?.rhuName}.`,
          toBarangayName: b.name,
          fromRhuId:      userData?.rhuId  ?? "",
          fromRhuName:    userData?.rhuName ?? "",
          distributionId: dist.id,
          read:           false,
          createdAt:      serverTimestamp()
        });
      }

      alert("Distributed to all barangays successfully!");
      loadDistributions();
    } catch (err) { alert("Error: " + err.message); }
    setDistributingId(null);
  }

  async function deleteDistribution(id) {
    if (!confirm("Delete this distribution?")) return;
    try {
      await deleteDoc(doc(db, "rhu_distributions", id));
      setDistributions(distributions.filter(d => d.id !== id));
    } catch (err) { alert("Error: " + err.message); }
  }

  const pendingCount      = distributions.filter(d => d.status === "Pending" || d.status === "Partial").length;
  const totalDistributed  = distributions.reduce((s, d) => s + (d.totalBoxes || 0), 0);
  const tableRows         = distributions.slice().sort((a, b) =>
    (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
  );

  return (
    <div className="rhu-layout">
      {/* ── Sidebar ── */}
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
              {item.label === "Notifications" && unreadCount && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="rhu-sidebar-footer">
          <button className="rhu-nav-item rhu-nav-btn">Settings</button>
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="rhu-main">
        <header className="rhu-topbar">
          <input className="rhu-search" type="text"
            placeholder="Search for barangays, supplies or records..." />
          <div className="rhu-topbar-right">
            <button className="rhu-notif-btn">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </button>
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">{userData?.username || "RHU Admin"}</span>
                <span className="rhu-user-role">{userData?.rhuName  || "RHU Unit"}</span>
              </div>
              <div className="rhu-avatar">RH</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header">
            <div>
              <h1 className="rhu-page-title">RHU Distribution</h1>
              <p className="rhu-page-sub">Manage and allocate medical supplies across barangay health centers.</p>
            </div>
            <button className="rhu-btn-primary" onClick={() => setShowNewModal(true)}>
              New Distribution
            </button>
          </div>

          {/* Stats */}
          <div className="rhu-dist-stats-row">
            <div className="rhu-dist-stat-card">
              <div className="rhu-dist-stat-icon rhu-dist-icon--orange">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
                </svg>
              </div>
              <div>
                <p className="rhu-dist-stat-label">Pending Distribution</p>
                <p className="rhu-dist-stat-value">{pendingCount}</p>
              </div>
            </div>
            <div className="rhu-dist-stat-card">
              <div className="rhu-dist-stat-icon rhu-dist-icon--blue">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
                </svg>
              </div>
              <div>
                <p className="rhu-dist-stat-label">Total Distributed (boxes)</p>
                <p className="rhu-dist-stat-value">{totalDistributed.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Distribution Plans */}
          {loading ? (
            <div className="rhu-empty-state"><p>Loading distributions...</p></div>
          ) : tableRows.length === 0 ? (
            <div className="rhu-empty-state">
              <div className="rhu-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <h2 className="rhu-empty-title">No Distribution Plans Yet</h2>
              <p className="rhu-empty-text">Click "New Distribution" to allocate supplies to all barangays.</p>
              <button className="rhu-btn-primary" onClick={() => setShowNewModal(true)}>New Distribution</button>
            </div>
          ) : (
            tableRows.map(dist => (
              <section className="rhu-dist-plan" key={dist.id}>
                <div className="rhu-dist-plan-header">
                  <div>
                    <h2 className="rhu-dist-plan-title">Barangay Supply Distribute</h2>
                    <p className="rhu-dist-plan-sub">
                      <strong>{dist.medicineName}</strong> — {dist.totalBoxes} boxes &nbsp;·&nbsp; {dist.date}
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                    <span className={`rhu-dist-plan-badge ${dist.status === "Completed" ? "rhu-badge--done" : "rhu-badge--pending"}`}>
                      {dist.status}
                    </span>
                    {dist.status !== "Completed" && (
                      <button className="rhu-btn-primary"
                        style={{ padding: "7px 14px", fontSize: "13px" }}
                        disabled={distributingId === "all-" + dist.id}
                        onClick={() => distributeAllBarangays(dist)}>
                        {distributingId === "all-" + dist.id ? "Distributing..." : "Distribute All"}
                      </button>
                    )}
                    <button className="rhu-btn-danger-sm" onClick={() => deleteDistribution(dist.id)}>Delete</button>
                  </div>
                </div>

                <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                <table className="rhu-inv-table">
                  <thead>
                    <tr>
                      <th>BARANGAY</th>
                      <th>MEDICINE</th>
                      <th>BOXES</th>
                      <th>STATUS</th>
                      <th>ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dist.barangayDistribution || []).map(b => (
                      <tr key={b.id}>
                        <td><strong>{b.name}</strong></td>
                        <td>{dist.medicineName}</td>
                        <td>{b.boxes} boxes</td>
                        <td>
                          <span className={`rhu-inv-status-badge ${b.status === "Distributed" ? "rhu-status--completed" : "rhu-status--pending"}`}>
                            {b.status || "Pending"}
                          </span>
                        </td>
                        <td>
                          <div className="rhu-action-group">
                            <button
                              className="rhu-btn-action rhu-btn-review"
                              onClick={() => { setReviewData({ dist, b }); setShowReviewModal(true); }}
                            >
                              Review
                            </button>
                            {b.status !== "Distributed" ? (
                              <button
                                className="rhu-btn-action rhu-btn-distribute"
                                disabled={distributingId === b.id + dist.id}
                                onClick={() => distributeToBarangay(dist, b.id)}
                              >
                                {distributingId === b.id + dist.id ? "..." : "Distribute"}
                              </button>
                            ) : (
                              <span className="rhu-distributed-label">Done</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </section>
            ))
          )}
        </main>
      </div>

      {/* ── New Distribution Modal ── */}
      {showNewModal && (
        <div className="rhu-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="rhu-modal rhu-modal--lg" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Auto Calculate Distribution</h2>
              <button className="rhu-modal-close" onClick={() => setShowNewModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">

              {/* Medicine + Total Boxes */}
              <div className="rhu-dist-calc-row">
                <div className="rhu-form-field" style={{ flex: 2 }}>
                  <label className="rhu-label">Select Medicine from Inventory</label>
                  <select className="rhu-input" value={selectedInvId}
                    onChange={e => { setSelectedInvId(e.target.value); setCalculatedDist([]); }}>
                    <option value="">-- Select Medicine --</option>
                    {inventory.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.remaining ?? item.quantity} boxes available)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="rhu-form-field" style={{ flex: 1 }}>
                  <label className="rhu-label">Total Boxes to Distribute</label>
                  <input className="rhu-input" type="number" placeholder="e.g., 90"
                    value={totalBoxes}
                    onChange={e => { setTotalBoxes(e.target.value); setCalculatedDist([]); }} />
                </div>
              </div>

              {/* Editable Barangay % Table */}
              <p className="rhu-dist-note" style={{ marginBottom: "8px" }}>
                Edit population % per barangay if needed (total must equal 100%):
              </p>
              <div className="rhu-barangay-pct-table">
                <div className="rhu-barangay-pct-header">
                  <span>BARANGAY</span>
                  <span>POPULATION %</span>
                </div>
                {barangays.map(b => (
                  <div key={b.id} className="rhu-barangay-pct-row">
                    <span>{b.name}</span>
                    <div className="rhu-pct-input-wrap">
                      <input
                        className="rhu-input rhu-pct-input"
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={(b.populationPercent * 100).toFixed(1)}
                        onChange={e => updateBarangayPercent(b.id, e.target.value)}
                      />
                      <span className="rhu-pct-symbol">%</span>
                    </div>
                  </div>
                ))}
                <div className="rhu-barangay-pct-total">
                  <span>Total</span>
                  <span className={
                    Math.abs(barangays.reduce((s, b) => s + b.populationPercent, 0) - 1) > 0.02
                      ? "rhu-pct-total--warn"
                      : "rhu-pct-total--ok"
                  }>
                    {(barangays.reduce((s, b) => s + b.populationPercent, 0) * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              <button className="rhu-btn-secondary" style={{ marginTop: "1rem", marginBottom: "1rem" }}
                onClick={calculateDistribution}>
                Calculate
              </button>

              {/* Calculated result table */}
              {calculatedDist.length > 0 && (
                <>
                  <p className="rhu-dist-note">Calculated distribution:</p>
                  <table className="rhu-inv-table">
                    <thead>
                      <tr>
                        <th>BARANGAY</th>
                        <th>POPULATION %</th>
                        <th>BOXES TO RECEIVE</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculatedDist.map(b => (
                        <tr key={b.id}>
                          <td><strong>{b.name}</strong></td>
                          <td>{(b.populationPercent * 100).toFixed(1)}%</td>
                          <td><strong>{b.boxes} boxes</strong></td>
                        </tr>
                      ))}
                      <tr className="rhu-table-total">
                        <td colSpan={2}><strong>Total</strong></td>
                        <td><strong>{calculatedDist.reduce((s, b) => s + b.boxes, 0)} boxes</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
              {calculatedDist.length > 0 && (
                <button className="rhu-btn-primary" onClick={saveDistributionPlan} disabled={saving}>
                  {saving ? "Saving..." : "Save & Notify All Barangays"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Review Modal ── */}
      {showReviewModal && reviewData && (
        <div className="rhu-modal-overlay" onClick={() => setShowReviewModal(false)}>
          <div className="rhu-modal" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Review — {reviewData.b.name}</h2>
              <button className="rhu-modal-close" onClick={() => setShowReviewModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <div className="rhu-review-row"><span>Medicine</span><strong>{reviewData.dist.medicineName}</strong></div>
              <div className="rhu-review-row"><span>Boxes Allocated</span><strong>{reviewData.b.boxes} boxes</strong></div>
              <div className="rhu-review-row">
                <span>Status</span>
                <span className={`rhu-inv-status-badge ${reviewData.b.status === "Distributed" ? "rhu-status--completed" : "rhu-status--pending"}`}>
                  {reviewData.b.status || "Pending"}
                </span>
              </div>
              <div className="rhu-review-row"><span>Date</span><strong>{reviewData.dist.date}</strong></div>
              <div className="rhu-review-row">
                <span>Population Share</span>
                <strong>{(reviewData.b.populationPercent * 100).toFixed(1)}%</strong>
              </div>
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setShowReviewModal(false)}>Close</button>
              {reviewData.b.status !== "Distributed" && (
                <button className="rhu-btn-primary"
                  onClick={() => {
                    distributeToBarangay(reviewData.dist, reviewData.b.id);
                    setShowReviewModal(false);
                  }}>
                  Distribute Now
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}