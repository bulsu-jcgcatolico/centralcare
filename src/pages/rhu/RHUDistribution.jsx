import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, getDoc, deleteDoc, doc,
  serverTimestamp, query, where, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { checkAndNotifyLowStock } from "../../utils/lowStockNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./RHUDistribution.css";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"      },
  { label: "Inventory",     to: "/rhu/inventory"      },
  { label: "Barangay",      to: "/rhu/barangay"       },
  { label: "Distribution",  to: "/rhu/distribution"   },
  { label: "Reports",       to: "/rhu/reports"        },
  { label: "Notifications", to: "/rhu/notifications"  },
];

// Barangays are now assigned by CHO (shared master data) — this page reads
// them, it doesn't manage the list itself anymore.
const BARANGAYS_COLLECTION = "cho_barangays";
const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

export default function RHUDistribution() {
  const { logout, user, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [distributions, setDistributions]   = useState([]);
  const [inventory, setInventory]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [distributingId, setDistributingId] = useState(null);

  // Barangays assigned to this RHU by CHO — read-only membership here,
  // population % is edited on the dedicated Barangay page.
  const [barangays, setBarangays]               = useState([]);
  const [barangaysLoaded, setBarangaysLoaded]    = useState(false);

  // New distribution modal — multi-medicine selection
  const [showNewModal, setShowNewModal]     = useState(false);
  const [selectedItems, setSelectedItems]   = useState({}); // { [inventoryId]: "boxes string" }
  const [calculatedPlans, setCalculatedPlans] = useState([]); // [{ inventoryId, item, totalBoxes, dist }]

  // Review modal
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewData, setReviewData]           = useState(null);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => {
    loadDistributions();
    loadInventory();
    loadAssignedBarangays();
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

  // Read the barangays CHO assigned to this RHU (from cho_rhu_registry),
  // then pull each one's full details + population % from cho_barangays.
  async function loadAssignedBarangays() {
    try {
      const rhuId = userData?.rhuId ?? "";
      const registrySnap = await getDoc(doc(db, RHU_REGISTRY_COLLECTION, rhuId));
      const assignedNames = registrySnap.exists()
        ? (registrySnap.data().assignedBarangays || [])
        : [];

      if (assignedNames.length === 0) {
        setBarangays([]);
        setBarangaysLoaded(true);
        return;
      }

      const allBarangaysSnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
      const allBarangays = allBarangaysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const assigned = allBarangays
        .filter(b => assignedNames.includes(b.barangayName))
        .map(b => ({ id: b.id, name: b.barangayName, populationPercent: b.populationPercent ?? 0 }));

      setBarangays(assigned);
    } catch (err) {
      console.error(err);
      setBarangays([]);
    }
    setBarangaysLoaded(true);
  }

  // ── Multi-medicine selection ────────────────────────────────────────────────
  function toggleMedicine(id, checked) {
    setSelectedItems(prev => {
      const next = { ...prev };
      if (checked) next[id] = next[id] ?? "";
      else delete next[id];
      return next;
    });
    setCalculatedPlans([]);
  }

  function updateMedicineBoxes(id, value) {
    setSelectedItems(prev => ({ ...prev, [id]: value }));
    setCalculatedPlans([]);
  }

  function resetNewModal() {
    setSelectedItems({});
    setCalculatedPlans([]);
  }

  // Auto-calculate boxes per barangay, for every selected medicine.
  // Percentages are treated as relative weights, so they don't need to
  // add up to exactly 100% — e.g. 20% + 15% still splits proportionally.
  function calculatePlans() {
    const entries = Object.entries(selectedItems);
    if (entries.length === 0) { alert("Select at least one medicine to distribute."); return; }

    const activeBarangays = barangays.filter(b => b.populationPercent > 0);
    const weightSum = activeBarangays.reduce((s, b) => s + b.populationPercent, 0);
    if (activeBarangays.length === 0 || weightSum <= 0) {
      alert('Set a population % for at least one barangay first — go to the Barangay page.');
      return;
    }

    const plans = [];
    for (const [invId, boxesStr] of entries) {
      const total = parseInt(boxesStr);
      const item = inventory.find(i => i.id === invId);
      if (!item) continue;
      if (!total || total <= 0) {
        alert(`Enter a valid number of boxes for ${item.name}.`);
        return;
      }
      const avail = item.remaining ?? item.quantity;
      if (total > avail) {
        alert(`Only ${avail} boxes of ${item.name} remaining!`);
        return;
      }
      let rem = total;
      const dist = activeBarangays.map((b, i) => {
        const share = b.populationPercent / weightSum;
        const boxes = i === activeBarangays.length - 1
          ? rem
          : Math.round(total * share);
        rem -= boxes;
        return { ...b, boxes, status: "Pending" };
      });
      plans.push({ inventoryId: invId, item, totalBoxes: total, dist });
    }
    setCalculatedPlans(plans);
  }

  // Save plan(s) + deduct inventory + create midwife stock + notify barangays
  async function saveDistributionPlan() {
    if (calculatedPlans.length === 0) return;
    setSaving(true);
    try {
      for (const plan of calculatedPlans) {
        const docRef = await addDoc(collection(db, "rhu_distributions"), {
          fromType:             "rhu",
          fromRhuId:            userData?.rhuId  ?? "",
          fromRhuName:          userData?.rhuName ?? "",
          inventoryId:          plan.inventoryId,
          medicineName:         plan.item.name,
          totalBoxes:           plan.totalBoxes,
          barangayDistribution: plan.dist,
          status:               "Pending",
          createdBy:            user?.uid ?? "",
          createdAt:            serverTimestamp(),
          date:                 new Date().toLocaleDateString()
        });

        const newRemaining = (plan.item.remaining ?? plan.item.quantity) - plan.totalBoxes;
        await updateDoc(doc(db, "inventory", plan.inventoryId), { remaining: newRemaining });
        await checkAndNotifyLowStock({ id: plan.inventoryId, name: plan.item.name, remaining: newRemaining }, "rhu", userData);

        for (const b of plan.dist) {
          await addDoc(collection(db, "inventory"), {
            productKey:    plan.item.productKey ?? "",
            name:          plan.item.name,
            category:      plan.item.category ?? "",
            subCategory:   plan.item.subCategory ?? "",
            lotNumber:     plan.item.lotNumber ?? "",
            quantity:      b.boxes,
            remaining:     b.boxes,
            expiry:        plan.item.expiry ?? "",
            source:        "RHU",
            ownerType:     "midwife",
            barangayName:  b.name,
            fromRhuId:     userData?.rhuId  ?? "",
            fromRhuName:   userData?.rhuName ?? "",
            distributionId: docRef.id,
            receivedStatus: "Pending",
            createdAt:     serverTimestamp(),
          });

          await addDoc(collection(db, "notifications"), {
            type:           "distribution",
            title:          "New Supply from RHU",
            message:        `${userData?.rhuName} has allocated ${b.boxes} boxes of ${plan.item.name} for ${b.name} barangay. Please confirm receipt in your Inventory.`,
            toBarangayName: b.name,
            fromRhuId:      userData?.rhuId  ?? "",
            fromRhuName:    userData?.rhuName ?? "",
            distributionId: docRef.id,
            read:           false,
            createdAt:      serverTimestamp()
          });
        }
      }

      alert(`Distribution plan${calculatedPlans.length > 1 ? "s" : ""} saved! All barangays have been notified.`);
      setShowNewModal(false);
      resetNewModal();
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
  const grandTotalBoxes   = calculatedPlans.reduce((s, p) => s + p.totalBoxes, 0);

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
            placeholder="Search for barangays, supplies or records..." aria-label="Search" />
          <div className="rhu-topbar-right">
            <button className="rhu-notif-btn" aria-label="Notifications">
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
            <div className="rhu-page-header-actions">
              <button className="rhu-btn-secondary" onClick={() => navigate("/rhu/barangay")}>
                Manage Barangays
              </button>
              <button className="rhu-btn-primary" onClick={() => setShowNewModal(true)}>
                New Distribution
              </button>
            </div>
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
                  <div className="rhu-plan-header-actions">
                    <span className={`rhu-dist-plan-badge ${dist.status === "Completed" ? "rhu-badge--done" : "rhu-badge--pending"}`}>
                      {dist.status}
                    </span>
                    {dist.status !== "Completed" && (
                      <button className="rhu-btn-primary rhu-btn-sm"
                        disabled={distributingId === "all-" + dist.id}
                        onClick={() => distributeAllBarangays(dist)}>
                        {distributingId === "all-" + dist.id ? "Distributing..." : "Distribute All"}
                      </button>
                    )}
                    <button className="rhu-btn-danger-sm" onClick={() => deleteDistribution(dist.id)}>Delete</button>
                  </div>
                </div>

                <div className="rhu-table-wrapper">
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

      {/* ── New Distribution Modal (multi-medicine) ── */}
      {showNewModal && (
        <div className="rhu-modal-overlay" onClick={() => { setShowNewModal(false); resetNewModal(); }}>
          <div className="rhu-modal rhu-modal--lg" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">New Distribution</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => { setShowNewModal(false); resetNewModal(); }}>×</button>
            </div>
            <div className="rhu-modal-body">

              <p className="rhu-dist-note">Select one or more medicines and enter how many boxes of each to distribute.</p>

              <div className="rhu-med-select-list">
                {inventory.map(item => {
                  const checked = item.id in selectedItems;
                  const avail = item.remaining ?? item.quantity;
                  return (
                    <div className={`rhu-med-select-row ${checked ? "rhu-med-select-row--active" : ""}`} key={item.id}>
                      <label className="rhu-med-checkbox-label">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => toggleMedicine(item.id, e.target.checked)}
                        />
                        <span className="rhu-med-checkbox-text">
                          <strong>{item.name}</strong>
                          <span className="rhu-med-checkbox-sub">{avail} boxes available</span>
                        </span>
                      </label>
                      {checked && (
                        <input
                          className="rhu-input rhu-med-boxes-input"
                          type="number"
                          min="1"
                          placeholder="Boxes"
                          value={selectedItems[item.id]}
                          onChange={e => updateMedicineBoxes(item.id, e.target.value)}
                          aria-label={`Boxes of ${item.name} to distribute`}
                        />
                      )}
                    </div>
                  );
                })}
                {inventory.length === 0 && (
                  <p className="rhu-dist-note">No medicines in inventory yet.</p>
                )}
              </div>

              {/* Read-only summary of the currently configured barangays */}
              <div className="rhu-barangay-summary">
                <div className="rhu-barangay-summary-header">
                  <span>Distributing across {barangays.length} barangay{barangays.length !== 1 ? "s" : ""}</span>
                  <button type="button" className="rhu-link-btn" onClick={() => navigate("/rhu/barangay")}>
                    Edit barangays
                  </button>
                </div>
                <div className="rhu-barangay-summary-chips">
                  {barangays.map(b => (
                    <span className="rhu-barangay-chip" key={b.id}>
                      {b.name} · {(b.populationPercent * 100).toFixed(1)}%
                    </span>
                  ))}
                </div>
              </div>

              <button className="rhu-btn-secondary rhu-calc-btn" onClick={calculatePlans}>
                Calculate
              </button>

              {calculatedPlans.length > 0 && (
                <>
                  <p className="rhu-dist-note">Auto-distributed by barangay population %:</p>
                  {calculatedPlans.map(plan => (
                    <div className="rhu-plan-preview" key={plan.inventoryId}>
                      <p className="rhu-plan-preview-title">{plan.item.name} — {plan.totalBoxes} boxes</p>
                      <div className="rhu-table-wrapper">
                      <table className="rhu-inv-table">
                        <thead>
                          <tr>
                            <th>BARANGAY</th>
                            <th>POPULATION %</th>
                            <th>BOXES TO RECEIVE</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.dist.map(b => (
                            <tr key={b.id}>
                              <td><strong>{b.name}</strong></td>
                              <td>{(b.populationPercent * 100).toFixed(1)}%</td>
                              <td><strong>{b.boxes} boxes</strong></td>
                            </tr>
                          ))}
                          <tr className="rhu-table-total">
                            <td colSpan={2}><strong>Total</strong></td>
                            <td><strong>{plan.dist.reduce((s, b) => s + b.boxes, 0)} boxes</strong></td>
                          </tr>
                        </tbody>
                      </table>
                      </div>
                    </div>
                  ))}
                  <div className="rhu-barangay-total-row rhu-pct-total--ok">
                    <span>Grand Total</span>
                    <strong>{grandTotalBoxes} boxes across {calculatedPlans.length} medicine{calculatedPlans.length > 1 ? "s" : ""}</strong>
                  </div>
                </>
              )}
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => { setShowNewModal(false); resetNewModal(); }}>Cancel</button>
              {calculatedPlans.length > 0 && (
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
              <button className="rhu-modal-close" aria-label="Close" onClick={() => setShowReviewModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <div className="rhu-review-row"><span>Medicine</span><strong>{reviewData.dist.medicineName}</strong></div>
              <div className="rhu-review-row"><span>Boxes Allocated</span><strong>{reviewData.b.boxes} boxes</strong></div>
              {Array.isArray(reviewData.b.items) && reviewData.b.items.length > 1 && (
                <div className="rhu-review-items-box">
                  <p className="rhu-review-items-label">ITEMS</p>
                  {reviewData.b.items.map((it, i) => (
                    <div className="rhu-review-items-row" key={i}>
                      <span>{it.name}</span>
                      <strong>{it.boxes} boxes</strong>
                    </div>
                  ))}
                </div>
              )}
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