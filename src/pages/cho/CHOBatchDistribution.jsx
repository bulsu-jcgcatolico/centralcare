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
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Population Report", to: "/cho/population-report"  },
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

  const [showDistributeModal, setShowDistributeModal] = useState(false);
  const [distributingBatch, setDistributingBatch]     = useState(null);
  const [boxesToDistribute, setBoxesToDistribute]     = useState("");
  const [calculatedDist, setCalculatedDist]           = useState(null);

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

  function calculatePercentageSplit() {
    const activeRhus = rhus.filter(r => (Number(r.totalPopulation) || 0) > 0);
    const populationSum = activeRhus.reduce((s, r) => s + (Number(r.totalPopulation) || 0), 0);

    if (activeRhus.length === 0 || populationSum <= 0) {
      alert('No RHU has a Total Population set yet. Set it in RHU Management first.');
      return;
    }
    const total = parseInt(boxesToDistribute, 10);
    const remaining = distributingBatch.remaining ?? distributingBatch.quantity;
    if (!total || total <= 0) {
      alert("Enter a valid number of boxes.");
      return;
    }
    if (total > remaining) {
      alert(`Only ${remaining} boxes of this batch remain.`);
      return;
    }

    let rem = total;
    const dist = activeRhus.map((rhu, i) => {
      const rhuPop = Number(rhu.totalPopulation) || 0;
      const computedSharePercent = (rhuPop / populationSum);
      const boxes = i === activeRhus.length - 1
        ? rem
        : Math.round(total * computedSharePercent);
      rem -= boxes;
      return {
        id: rhu.id,
        name: rhu.rhuName,
        boxes,
        sharePercent: (computedSharePercent * 100).toFixed(1),
        status: "Pending",
      };
    });

    setCalculatedDist(dist);
  }

  async function confirmDistribute() {
    if (!calculatedDist) return;
    setSaving(true);
    try {
      const totalBoxes = parseInt(boxesToDistribute, 10);

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

      const newRemaining = (distributingBatch.remaining ?? distributingBatch.quantity) - totalBoxes;
      await updateDoc(doc(db, BATCHES_COLLECTION, distributingBatch.id), { remaining: newRemaining });

      for (const rhu of calculatedDist) {
        await addDoc(collection(db, "notifications"), {
          type: "distribution",
          title: "New Supply from CHO",
          message: `CHO has allocated ${rhu.boxes} boxes of ${distributingBatch.name} (Lot ${distributingBatch.lotNumber || "—"}) for ${rhu.name}. Please confirm receipt in your Inventory.`,
          toRhuId: rhu.id,
          toRhuName: rhu.name,
          fromType: "cho",
          distributionId: docRef.id,
          read: false,
          createdAt: serverTimestamp()
        });

        await addDoc(collection(db, "inventory"), {
          productKey: distributingBatch.productId ?? "",
          name: distributingBatch.name,
          category: distributingBatch.category ?? "",
          subCategory: distributingBatch.subCategory ?? "",
          lotNumber: distributingBatch.lotNumber ?? "",
          quantity: rhu.boxes,
          remaining: rhu.boxes,
          expiry: distributingBatch.expiryDate ?? "",
          source: "CHO",
          ownerType: "rhu",
          rhuId: rhu.id,
          rhuName: rhu.name,
          distributionId: docRef.id,
          receivedStatus: "Pending",
          createdAt: serverTimestamp(),
        });
      }

      alert("Batch distributed according to RHU population proportions, and RHUs have been notified.");
      setShowDistributeModal(false);
      loadBatches();
      loadDistributions();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

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

  // --- UPDATED: Filters batches to only show ones that have remaining stock AND are accepted ---
  const availableBatches = batches.filter(b => {
    const hasRemaining = (b.remaining ?? b.quantity) > 0;
    // Checks if status is explicitly accepted/received (or defaults to true if status is not set)
    const isAccepted = !b.status || b.status.toLowerCase() === "accepted" || b.status.toLowerCase() === "received";
    return hasRemaining && isAccepted;
  });

  const pendingCount = distributions.filter(d => d.status === "Pending" || d.status === "Partial").length;
  const totalDistributed = distributions.reduce((s, d) => s + (d.totalBoxes || 0), 0);

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
            <p className="rhu-brand-role">CHO ADMIN PANEL</p>
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
          <input className="rhu-search" type="text" placeholder="Search batches..." aria-label="Search" />
          <div className="rhu-topbar-right">
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">Dr. Sarah Smith</span>
                <span className="rhu-user-role">CHO Administrator</span>
              </div>
              <div className="rhu-avatar">SS</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header">
            <div>
              <h1 className="rhu-page-title">Batch Distribution</h1>
              <p className="rhu-page-sub">Distribute available batches based on total population metrics across registered RHUs.</p>
            </div>
          </div>

          {rhus.length === 0 && (
            <div className="rhu-dist-note" style={{ padding: "12px 16px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px" }}>
              No RHUs registered yet — go to <strong>RHU Management</strong> to set them up before distributing.
            </div>
          )}

          <div className="rhu-dist-stats-row">
            <div className="rhu-dist-stat-card">
              <div className="rhu-dist-stat-icon rhu-dist-icon--orange">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
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
                  <path d="M20 6h-2.18c.07-.44.18-.88.18-1.34C18 2.99 16.01 1 13.66 1c-1.28 0-2.44.56-3.26 1.45L9 4 7.6 2.45C6.78 1.56 5.62 1 4.34 1 1.99 1 0 2.99 0 5.34c0 .44.08.88.18 1.34-.07 0H0v2h20V6z"/>
                </svg>
              </div>
              <div>
                <p className="rhu-dist-stat-label">Total Distributed</p>
                <p className="rhu-dist-stat-value">{totalDistributed.toLocaleString()}</p>
              </div>
            </div>
          </div>

          <section className="rhu-section">
            <div className="rhu-dist-plan-header">
              <div>
                <h2 className="rhu-dist-plan-title">Available Batches</h2>
                <p className="rhu-dist-plan-sub">Click Distribute beside a batch to split it among all registered RHUs.</p>
              </div>
            </div>
            <div className="rhu-table-wrapper">
              <table className="rhu-table">
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
                    <tr><td colSpan={7}>No available accepted batches. Add and accept stock in Batch Inventory first.</td></tr>
                  ) : (
                    availableBatches.map(b => (
                      <tr key={b.id}>
                        <td className="rhu-product-key"><strong>{b.batchId || "—"}</strong></td>
                        <td className="rhu-product-key">{b.productId || "—"}</td>
                        <td><strong>{b.name}</strong></td>
                        <td className="rhu-product-key">{b.lotNumber || "—"}</td>
                        <td><strong>{b.remaining ?? b.quantity} boxes</strong></td>
                        <td>{b.expiryDate}</td>
                        <td>
                          <button className="rhu-btn-action rhu-btn-distribute" onClick={() => openDistributeModal(b)}>
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

          {distributions.map(dist => (
            <section className="rhu-section" key={dist.id}>
              <div className="rhu-dist-plan-header">
                <div>
                  <h2 className="rhu-dist-plan-title">RHU Supply Distribute</h2>
                  <p className="rhu-dist-plan-sub">
                    <strong>{dist.medicineName}</strong> — {dist.totalBoxes} boxes total &nbsp;·&nbsp; {dist.date}
                  </p>
                </div>
                <div className="rhu-plan-header-actions">
                  {dist.status !== "Completed" && (
                    <button className="rhu-btn-primary rhu-btn-sm"
                      disabled={distributingId === "all-" + dist.id}
                      onClick={() => distributeAllRHUs(dist)}>
                      {distributingId === "all-" + dist.id ? "Distributing..." : "Distribute All"}
                    </button>
                  )}
                  <button className="rhu-btn-danger-sm" onClick={() => deleteDistribution(dist.id)}>Delete Plan</button>
                </div>
              </div>

              <div className="rhu-table-wrapper">
                <table className="rhu-table">
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
                          <span className={`rhu-status-badge ${rhu.status === "Distributed" ? "rhu-status--completed" : "rhu-status--pending"}`}>
                            {rhu.status || "Pending"}
                          </span>
                        </td>
                        <td>
                          <div className="rhu-action-group">
                            <button
                              className="rhu-btn-action"
                              onClick={() => { setReviewData({ dist, rhu }); setShowReviewModal(true); }}
                            >
                              Review
                            </button>
                            {rhu.status !== "Distributed" && (
                              <button
                                className="rhu-btn-action rhu-btn-distribute"
                                disabled={distributingId === rhu.id + dist.id}
                                onClick={() => distributeToRHU(dist, rhu.id)}
                              >
                                {distributingId === rhu.id + dist.id ? "..." : "Distribute"}
                              </button>
                            )}
                            {rhu.status === "Distributed" && (
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
          ))}
        </main>
      </div>

      {/* Distribute Batch Modal */}
      {showDistributeModal && distributingBatch && (
        <div className="rhu-modal-overlay" onClick={() => setShowDistributeModal(false)}>
          <div className="rhu-modal" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Distribute {distributingBatch.name}</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => setShowDistributeModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <p className="rhu-dist-note">
                Lot {distributingBatch.lotNumber || "—"} — {distributingBatch.remaining ?? distributingBatch.quantity} boxes remaining.
                Calculates share dynamically based on total RHU population.
              </p>
              <div className="rhu-form-field">
                <label className="rhu-label">Boxes to Distribute</label>
                <input className="rhu-input" type="number" min="1" placeholder="e.g., 100"
                  value={boxesToDistribute} onChange={e => { setBoxesToDistribute(e.target.value); setCalculatedDist(null); }} />
              </div>
              <button className="rhu-btn-secondary" onClick={calculatePercentageSplit}>Calculate Split</button>

              {calculatedDist && (
                <>
                  <p className="rhu-dist-note" style={{ marginTop: "1rem" }}>Calculated Split Preview:</p>
                  <table className="rhu-table">
                    <thead>
                      <tr><th>RHU</th><th>POP SHARE %</th><th>BOXES</th></tr>
                    </thead>
                    <tbody>
                      {calculatedDist.map(rhu => (
                        <tr key={rhu.id}>
                          <td><strong>{rhu.name}</strong></td>
                          <td>{rhu.sharePercent}%</td>
                          <td><strong>{rhu.boxes} boxes</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setShowDistributeModal(false)}>Cancel</button>
              {calculatedDist && (
                <button className="rhu-btn-primary" onClick={confirmDistribute} disabled={saving}>
                  {saving ? "Saving..." : "Confirm & Notify RHUs"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Review Modal */}
      {showReviewModal && reviewData && (
        <div className="rhu-modal-overlay" onClick={() => setShowReviewModal(false)}>
          <div className="rhu-modal" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Review — {reviewData.rhu.name}</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => setShowReviewModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <div className="rhu-review-row"><span>Medicine</span><strong>{reviewData.dist.medicineName}</strong></div>
              <div className="rhu-review-row"><span>Lot Number</span><strong>{reviewData.dist.lotNumber || "—"}</strong></div>
              <div className="rhu-review-row"><span>Boxes Allocated</span><strong>{reviewData.rhu.boxes} boxes</strong></div>
              <div className="rhu-review-row"><span>Status</span>
                <span className={`rhu-status-badge ${reviewData.rhu.status === "Distributed" ? "rhu-status--completed" : "rhu-status--pending"}`}>
                  {reviewData.rhu.status || "Pending"}
                </span>
              </div>
              <div className="rhu-review-row"><span>Date</span><strong>{reviewData.dist.date}</strong></div>
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setShowReviewModal(false)}>Close</button>
              {reviewData.rhu.status !== "Distributed" && (
                <button className="rhu-btn-primary"
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