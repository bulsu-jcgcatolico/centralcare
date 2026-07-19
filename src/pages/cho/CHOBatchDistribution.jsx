import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, where, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./CHOBatchDistribution.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",         to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Notifications",     to: "/cho/notifications"      },
];

const BATCHES_COLLECTION      = "cho_batches";
const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

export default function CHOBatchDistribution() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [batches, setBatches]           = useState([]);
  const [rhus, setRhus]                 = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [distributingId, setDistributingId] = useState(null);

  // Distribute modal (per batch)
  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [distributingBatch, setDistributingBatch]     = useState(null);
  const [boxesToDistribute, setBoxesToDistribute]     = useState("");
  const [calculatedDist, setCalculatedDist]           = useState(null);

  // Review modal
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewData, setReviewData]           = useState(null);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadBatches(); loadRhus(); loadDistributions(); }, []);

  async function loadBatches() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, BATCHES_COLLECTION));
      setBatches(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  async function loadRhus() {
    try {
      const snap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
      setRhus(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  }

  async function loadDistributions() {
    try {
      const q = query(collection(db, "distributions"), where("fromType", "==", "cho"));
      const snap = await getDocs(q);
      setDistributions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  }

  function openDistributeModal(batch) {
    setDistributingBatch(batch);
    setBoxesToDistribute("");
    setCalculatedDist(null);
    setShowDistributeModal(true);
  }

  // Split equally among every RHU currently in the registry
  function calculateEqualSplit() {
    if (rhus.length === 0) {
      alert("No RHUs are registered yet. Add them in RHU Management first.");
      return;
    }
    const total = parseInt(boxesToDistribute);
    const remaining = distributingBatch.remaining ?? distributingBatch.quantity;
    if (!total || total <= 0) {
      alert("Enter a valid number of boxes.");
      return;
    }
    if (total > remaining) {
      alert(`Only ${remaining} boxes of this batch remain.`);
      return;
    }

    const count = rhus.length;
    const base = Math.floor(total / count);
    const remainder = total % count;

    // Spread the remainder across the first few RHUs so it's as equal as possible
    const dist = rhus.map((rhu, i) => ({
      id: rhu.id,
      name: rhu.rhuName,
      boxes: base + (i < remainder ? 1 : 0),
      status: "Pending",
    }));

    setCalculatedDist(dist);
  }

  async function confirmDistribute() {
    if (!calculatedDist) return;
    setSaving(true);
    try {
      const totalBoxes = parseInt(boxesToDistribute);

      const docRef = await addDoc(collection(db, "distributions"), {
        fromType: "cho",
        inventoryId: distributingBatch.id,
        batchId: distributingBatch.batchId ?? "",
        productId: distributingBatch.productId ?? "",
        medicineName: distributingBatch.name,
        lotNumber: distributingBatch.lotNumber ?? "",
        totalBoxes,
        rhuDistribution: calculatedDist,
        status: "Pending",
        createdBy: user?.uid ?? "",
        createdAt: serverTimestamp(),
        date: new Date().toLocaleDateString()
      });

      // Deduct from the batch
      const newRemaining = (distributingBatch.remaining ?? distributingBatch.quantity) - totalBoxes;
      await updateDoc(doc(db, BATCHES_COLLECTION, distributingBatch.id), { remaining: newRemaining });

      // Notify each registered RHU
      for (const rhu of calculatedDist) {
        await addDoc(collection(db, "notifications"), {
          type: "distribution",
          title: "New Supply from CHO",
          message: `CHO has allocated ${rhu.boxes} boxes of ${distributingBatch.name} (Lot ${distributingBatch.lotNumber || "—"}) for ${rhu.name}. Awaiting distribution.`,
          toRhuId: rhu.id,
          toRhuName: rhu.name,
          fromType: "cho",
          distributionId: docRef.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      alert("Batch distributed equally among all registered RHUs, and they've been notified.");
      setShowDistributeModal(false);
      loadBatches();
      loadDistributions();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  // Mark one RHU row as distributed
  async function distributeToRHU(dist, rhuId) {
    setDistributingId(rhuId + dist.id);
    try {
      const updatedRhuDist = (dist.rhuDistribution || []).map(r =>
        r.id === rhuId ? { ...r, status: "Distributed" } : r
      );
      const allDone = updatedRhuDist.every(r => r.status === "Distributed");

      await updateDoc(doc(db, "distributions", dist.id), {
        rhuDistribution: updatedRhuDist,
        status: allDone ? "Completed" : "Partial"
      });

      const rhu = updatedRhuDist.find(r => r.id === rhuId);
      await addDoc(collection(db, "notifications"), {
        type: "distribution",
        title: "Supply Distributed",
        message: `Your ${rhu.boxes} boxes of ${dist.medicineName} have been dispatched by CHO.`,
        toRhuId: rhuId,
        toRhuName: rhu.name,
        fromType: "cho",
        distributionId: dist.id,
        read: false,
        createdAt: serverTimestamp()
      });

      loadDistributions();
    } catch (err) { alert("Error: " + err.message); }
    setDistributingId(null);
  }

  async function distributeAllRHUs(dist) {
    const rhuList = dist.rhuDistribution || [];
    if (!confirm(`Distribute ${dist.medicineName} to all ${rhuList.length} RHUs now?`)) return;
    setDistributingId("all-" + dist.id);
    try {
      const updatedRhuDist = rhuList.map(r => ({ ...r, status: "Distributed" }));

      await updateDoc(doc(db, "distributions", dist.id), {
        rhuDistribution: updatedRhuDist,
        status: "Completed"
      });

      for (const rhu of updatedRhuDist) {
        await addDoc(collection(db, "notifications"), {
          type: "distribution",
          title: "Supply Distributed",
          message: `Your ${rhu.boxes} boxes of ${dist.medicineName} have been dispatched by CHO.`,
          toRhuId: rhu.id,
          toRhuName: rhu.name,
          fromType: "cho",
          distributionId: dist.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      alert("Distributed to all RHUs successfully!");
      loadDistributions();
    } catch (err) { alert("Error: " + err.message); }
    setDistributingId(null);
  }

  async function deleteDistribution(id) {
    if (!confirm("Delete this distribution record?")) return;
    try {
      await deleteDoc(doc(db, "distributions", id));
      setDistributions(distributions.filter(d => d.id !== id));
    } catch (err) { alert("Error: " + err.message); }
  }

  const availableBatches = batches.filter(b => (b.remaining ?? b.quantity) > 0);
  const pendingCount = distributions.filter(d => d.status === "Pending" || d.status === "Partial").length;
  const totalDistributed = distributions.reduce((s, d) => s + (d.totalBoxes || 0), 0);

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
          {navItems.map(item => (
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
          <input className="cho-search" type="text" placeholder="Search batches..." aria-label="Search" />
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
              <h1 className="cho-page-title">Batch Distribution</h1>
              <p className="cho-page-sub">Distribute available batches — split equally among all registered RHUs.</p>
            </div>
          </div>

          {rhus.length === 0 && (
            <div className="cho-dist-note" style={{ padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px" }}>
              No RHUs registered yet — go to <strong>RHU Management</strong> to set them up before distributing.
            </div>
          )}

          {/* Stats */}
          <div className="cho-dist-stats-row">
            <div className="cho-dist-stat-card">
              <div className="cho-dist-stat-icon cho-dist-icon--orange">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                </svg>
              </div>
              <div>
                <p className="cho-dist-stat-label">Pending Distribution</p>
                <p className="cho-dist-stat-value">{pendingCount}</p>
              </div>
            </div>
            <div className="cho-dist-stat-card">
              <div className="cho-dist-stat-icon cho-dist-icon--blue">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M20 6h-2.18c.07-.44.18-.88.18-1.34C18 2.99 16.01 1 13.66 1c-1.28 0-2.44.56-3.26 1.45L9 4 7.6 2.45C6.78 1.56 5.62 1 4.34 1 1.99 1 0 2.99 0 5.34c0 .44.08.88.18 1.34-.07 0H0v2h20V6z"/>
                </svg>
              </div>
              <div>
                <p className="cho-dist-stat-label">Total Distributed</p>
                <p className="cho-dist-stat-value">{totalDistributed.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Available batches */}
          <section className="cho-section">
            <div className="cho-dist-plan-header">
              <div>
                <h2 className="cho-dist-plan-title">Available Batches</h2>
                <p className="cho-dist-plan-sub">Click Distribute beside a batch to split it among all registered RHUs.</p>
              </div>
            </div>
            <div className="cho-table-wrapper">
            <table className="cho-table">
              <thead>
                <tr>
                  <th>BATCH ID</th>
                  <th>PRODUCT ID</th>
                  <th>NAME</th>
                  <th>LOT #</th>
                  <th>REMAINING</th>
                  <th>EXPIRY</th>
                  <th>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7}>Loading batches...</td></tr>
                ) : availableBatches.length === 0 ? (
                  <tr><td colSpan={7}>No available batches. Add stock in Batch Inventory first.</td></tr>
                ) : (
                  availableBatches.map(b => (
                    <tr key={b.id}>
                      <td className="cho-product-key"><strong>{b.batchId || "—"}</strong></td>
                      <td className="cho-product-key">{b.productId || "—"}</td>
                      <td><strong>{b.name}</strong></td>
                      <td className="cho-product-key">{b.lotNumber || "—"}</td>
                      <td><strong>{b.remaining ?? b.quantity} boxes</strong></td>
                      <td>{b.expiryDate}</td>
                      <td>
                        <button className="cho-btn-action cho-btn-distribute" onClick={() => openDistributeModal(b)}>
                          Distribute
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            </div>
          </section>

          {/* Distribution Plans */}
          {distributions.map(dist => (
            <section className="cho-section cho-dist-plan" key={dist.id}>
              <div className="cho-dist-plan-header">
                <div>
                  <h2 className="cho-dist-plan-title">RHU Supply Distribute</h2>
                  <p className="cho-dist-plan-sub">
                    <strong>{dist.medicineName}</strong> — {dist.totalBoxes} boxes total &nbsp;·&nbsp; {dist.date}
                  </p>
                </div>
                <div className="cho-plan-header-actions">
                  {dist.status !== "Completed" && (
                    <button className="cho-btn-primary cho-btn-sm"
                      disabled={distributingId === "all-" + dist.id}
                      onClick={() => distributeAllRHUs(dist)}>
                      {distributingId === "all-" + dist.id ? "Distributing..." : "Distribute All"}
                    </button>
                  )}
                  <button className="cho-btn-danger-sm" onClick={() => deleteDistribution(dist.id)}>Delete Plan</button>
                </div>
              </div>

              <div className="cho-table-wrapper">
              <table className="cho-table">
                <thead>
                  <tr>
                    <th>RHU'S</th>
                    <th>MEDICINE</th>
                    <th>BOXES</th>
                    <th>STATUS</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {(dist.rhuDistribution || []).map(rhu => (
                    <tr key={rhu.id}>
                      <td><strong>{rhu.name}</strong></td>
                      <td>{dist.medicineName}</td>
                      <td>{rhu.boxes} boxes</td>
                      <td>
                        <span className={`cho-status-badge ${rhu.status === "Distributed" ? "cho-status--completed" : "cho-status--pending"}`}>
                          {rhu.status || "Pending"}
                        </span>
                      </td>
                      <td>
                        <div className="cho-action-group">
                          <button
                            className="cho-btn-action cho-btn-review"
                            onClick={() => { setReviewData({ dist, rhu }); setShowReviewModal(true); }}
                          >
                            Review
                          </button>
                          {rhu.status !== "Distributed" && (
                            <button
                              className="cho-btn-action cho-btn-distribute"
                              disabled={distributingId === rhu.id + dist.id}
                              onClick={() => distributeToRHU(dist, rhu.id)}
                            >
                              {distributingId === rhu.id + dist.id ? "..." : "Distribute"}
                            </button>
                          )}
                          {rhu.status === "Distributed" && (
                            <span className="cho-distributed-label">Done</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </section>
          ))}
        </main>
      </div>

      {/* ── Distribute Batch Modal ── */}
      {showDistributeModal && distributingBatch && (
        <div className="cho-modal-overlay" onClick={() => setShowDistributeModal(false)}>
          <div className="cho-modal" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">Distribute {distributingBatch.name}</h2>
              <button className="cho-modal-close" aria-label="Close" onClick={() => setShowDistributeModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">
              <p className="cho-dist-note">
                Lot {distributingBatch.lotNumber || "—"} — {distributingBatch.remaining ?? distributingBatch.quantity} boxes remaining.
                Will split equally among all {rhus.length} registered RHU{rhus.length !== 1 ? "s" : ""}.
              </p>
              <div className="cho-form-field">
                <label className="cho-label">Boxes to Distribute</label>
                <input className="cho-input" type="number" min="1" placeholder="e.g., 100"
                  value={boxesToDistribute} onChange={e => { setBoxesToDistribute(e.target.value); setCalculatedDist(null); }} />
              </div>
              <button className="cho-btn-secondary" onClick={calculateEqualSplit}>Calculate Split</button>

              {calculatedDist && (
                <>
                  <p className="cho-dist-note" style={{ marginTop: "1rem" }}>Equal split preview:</p>
                  <table className="cho-table">
                    <thead>
                      <tr><th>RHU</th><th>BOXES</th></tr>
                    </thead>
                    <tbody>
                      {calculatedDist.map(rhu => (
                        <tr key={rhu.id}>
                          <td><strong>{rhu.name}</strong></td>
                          <td><strong>{rhu.boxes} boxes</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowDistributeModal(false)}>Cancel</button>
              {calculatedDist && (
                <button className="cho-btn-primary" onClick={confirmDistribute} disabled={saving}>
                  {saving ? "Saving..." : "Confirm & Notify RHUs"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Review Modal ── */}
      {showReviewModal && reviewData && (
        <div className="cho-modal-overlay" onClick={() => setShowReviewModal(false)}>
          <div className="cho-modal" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">Review — {reviewData.rhu.name}</h2>
              <button className="cho-modal-close" aria-label="Close" onClick={() => setShowReviewModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">
              <div className="cho-review-row"><span>Medicine</span><strong>{reviewData.dist.medicineName}</strong></div>
              <div className="cho-review-row"><span>Lot Number</span><strong>{reviewData.dist.lotNumber || "—"}</strong></div>
              <div className="cho-review-row"><span>Boxes Allocated</span><strong>{reviewData.rhu.boxes} boxes</strong></div>
              <div className="cho-review-row"><span>Status</span>
                <span className={`cho-status-badge ${reviewData.rhu.status === "Distributed" ? "cho-status--completed" : "cho-status--pending"}`}>
                  {reviewData.rhu.status || "Pending"}
                </span>
              </div>
              <div className="cho-review-row"><span>Date</span><strong>{reviewData.dist.date}</strong></div>
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowReviewModal(false)}>Close</button>
              {reviewData.rhu.status !== "Distributed" && (
                <button className="cho-btn-primary"
                  onClick={() => { distributeToRHU(reviewData.dist, reviewData.rhu.id); setShowReviewModal(false); }}>
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