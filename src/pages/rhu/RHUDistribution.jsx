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

export default function RHUDistribution() {
  const { logout, user, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [distributions, setDistributions]   = useState([]);
  const [inventory, setInventory]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [distributingId, setDistributingId] = useState(null);

  // New distribution modal — manual entry (barangay name + item list)
  const [showNewModal, setShowNewModal] = useState(false);
  const [barangayName, setBarangayName] = useState("");
  const [items, setItems] = useState([{ id: 1, name: "", quantity: "" }]);

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

  // Item row management for the New Distribution modal
  function addItemRow() {
    setItems(prev => [...prev, { id: Date.now(), name: "", quantity: "" }]);
  }
  function removeItemRow(id) {
    if (items.length > 1) setItems(prev => prev.filter(it => it.id !== id));
  }
  function updateItemRow(id, field, value) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, [field]: value } : it));
  }
  function resetNewModal() {
    setBarangayName("");
    setItems([{ id: 1, name: "", quantity: "" }]);
  }

  // Save plan + deduct inventory + notify all barangays
  // Save manual distribution — one barangay, one or more items
  async function saveDistributionPlan() {
    if (!barangayName.trim()) { alert("Please enter the barangay name."); return; }
    const validItems = items.filter(it => it.name.trim() && parseInt(it.quantity) > 0);
    if (validItems.length === 0) { alert("Please enter at least one item with a name and quantity."); return; }

    setSaving(true);
    try {
      // Match each typed item name against RHU's own inventory (case-insensitive)
      // to find the matching stock to deduct from. If not found, still proceed
      // (allows distributing items not tracked in inventory, e.g. donated stock).
      const itemDetails = validItems.map(it => {
        const qty = parseInt(it.quantity);
        const invMatch = inventory.find(
          i => i.name.trim().toLowerCase() === it.name.trim().toLowerCase()
        );
        return { name: it.name.trim(), boxes: qty, invMatch };
      });

      const totalBoxesAll = itemDetails.reduce((s, it) => s + it.boxes, 0);

      // 1. Save the distribution record for this barangay
      const docRef = await addDoc(collection(db, "rhu_distributions"), {
        fromType:    "rhu",
        fromRhuId:   userData?.rhuId  ?? "",
        fromRhuName: userData?.rhuName ?? "",
        medicineName: itemDetails.map(it => it.name).join(", "),
        totalBoxes:   totalBoxesAll,
        barangayDistribution: [{
          id:     barangayName.trim().toLowerCase().replace(/\s+/g, "-"),
          name:   barangayName.trim(),
          boxes:  totalBoxesAll,
          items:  itemDetails.map(it => ({ name: it.name, boxes: it.boxes })),
          status: "Pending",
        }],
        status:    "Pending",
        createdBy: user?.uid ?? "",
        createdAt: serverTimestamp(),
        date:      new Date().toLocaleDateString()
      });

      // 2. For each item: deduct from RHU inventory (if matched) + create midwife inventory + notify
      for (const it of itemDetails) {
        if (it.invMatch) {
          const newRemaining = (it.invMatch.remaining ?? it.invMatch.quantity) - it.boxes;
          await updateDoc(doc(db, "inventory", it.invMatch.id), { remaining: newRemaining });
          await checkAndNotifyLowStock({ id: it.invMatch.id, name: it.invMatch.name, remaining: newRemaining }, "rhu", userData);
        }

        await addDoc(collection(db, "inventory"), {
          productKey:   it.invMatch?.productKey ?? "",
          name:         it.name,
          category:     it.invMatch?.category ?? "",
          subCategory:  it.invMatch?.subCategory ?? "",
          quantity:     it.boxes,
          remaining:    it.boxes,
          expiry:       it.invMatch?.expiry ?? "",
          source:       "RHU",
          ownerType:    "midwife",
          barangayName: barangayName.trim(),
          fromRhuId:    userData?.rhuId  ?? "",
          fromRhuName:  userData?.rhuName ?? "",
          distributionId: docRef.id,
          createdAt:    serverTimestamp(),
        });
      }

      // 3. Notify the barangay midwife once for the whole delivery
      await addDoc(collection(db, "notifications"), {
        type:           "distribution",
        title:          "New Supply from RHU",
        message:        `${userData?.rhuName} has sent ${totalBoxesAll} boxes (${itemDetails.map(it => it.name).join(", ")}) to ${barangayName.trim()} barangay.`,
        toBarangayName: barangayName.trim(),
        fromRhuId:      userData?.rhuId  ?? "",
        fromRhuName:    userData?.rhuName ?? "",
        distributionId: docRef.id,
        read:           false,
        createdAt:      serverTimestamp()
      });

      alert("Distribution added! The barangay has been notified.");
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
        <div className="rhu-modal-overlay" onClick={() => { setShowNewModal(false); resetNewModal(); }}>
          <div className="rhu-modal" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">New Distribution</h2>
              <button className="rhu-modal-close" onClick={() => { setShowNewModal(false); resetNewModal(); }}>×</button>
            </div>
            <div className="rhu-modal-body">

              <div className="rhu-form-field">
                <label className="rhu-label">Enter Barangay</label>
                <input className="rhu-input" type="text" placeholder="e.g., Longos"
                  value={barangayName} onChange={e => setBarangayName(e.target.value)} />
              </div>

              <div className="rhu-new-dist-items-header">
                <span>Item Name/s</span>
                <span>Total Quantity</span>
              </div>
              {items.map(it => (
                <div key={it.id} className="rhu-new-dist-item-row">
                  <input className="rhu-input" type="text" placeholder="e.g., Paracetamol 500mg Tablet"
                    value={it.name} onChange={e => updateItemRow(it.id, "name", e.target.value)} />
                  <input className="rhu-input" type="number" placeholder="e.g., 20"
                    value={it.quantity} onChange={e => updateItemRow(it.id, "quantity", e.target.value)} />
                  {items.length > 1 && (
                    <button className="rhu-new-dist-remove-btn" onClick={() => removeItemRow(it.id)}>×</button>
                  )}
                </div>
              ))}

              <button className="rhu-add-item-btn" onClick={addItemRow}>
                <span style={{ fontSize: "16px", lineHeight: 1 }}>+</span> Add Item
              </button>
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => { setShowNewModal(false); resetNewModal(); }}>Cancel</button>
              <button className="rhu-btn-primary" onClick={saveDistributionPlan} disabled={saving}>
                {saving ? "Adding..." : "Add"}
              </button>
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
              {Array.isArray(reviewData.b.items) && reviewData.b.items.length > 1 && (
                <div style={{ margin: "10px 0", padding: "10px 12px", background: "#f9fafb", borderRadius: "8px" }}>
                  <p style={{ fontSize: "12px", fontWeight: "600", color: "#6b7280", margin: "0 0 6px" }}>ITEMS</p>
                  {reviewData.b.items.map((it, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", padding: "3px 0" }}>
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