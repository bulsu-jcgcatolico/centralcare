import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  serverTimestamp, query, where, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import "./CHODistribution.css";

const navItems = [
  { label: "Dashboard",    to: "/cho/dashboard"    },
  { label: "Inventory",    to: "/cho/inventory"    },
  { label: "Distribution", to: "/cho/distribution" },
  { label: "Reports",      to: "/cho/reports"      },
  { label: "Notifications",to: "/cho/notifications"},
];

const RHU_DATA = [
  { id: 1,  name: "RHU 1",  populationPercent: 0.11 },
  { id: 2,  name: "RHU 2",  populationPercent: 0.07 },
  { id: 3,  name: "RHU 3",  populationPercent: 0.14 },
  { id: 4,  name: "RHU 4",  populationPercent: 0.09 },
  { id: 5,  name: "RHU 5",  populationPercent: 0.05 },
  { id: 6,  name: "RHU 6",  populationPercent: 0.10 },
  { id: 7,  name: "RHU 7",  populationPercent: 0.11 },
  { id: 8,  name: "RHU 8",  populationPercent: 0.09 },
  { id: 9,  name: "RHU 9",  populationPercent: 0.07 },
  { id: 10, name: "RHU 10", populationPercent: 0.17 },
];

export default function CHODistribution() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [distributions, setDistributions] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // New Distribution modal
  const [showNewModal, setShowNewModal] = useState(false);
  const [selectedInventoryId, setSelectedInventoryId] = useState("");
  const [totalBoxes, setTotalBoxes] = useState("");
  const [calculatedDist, setCalculatedDist] = useState([]);

  // Review modal
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewDist, setReviewDist] = useState(null);

  // Per-RHU distribute confirm
  const [distributingId, setDistributingId] = useState(null);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => {
    loadDistributions();
    loadInventory();
  }, []);

  async function loadInventory() {
    try {
      const q = query(collection(db, "inventory"), where("ownerType", "==", "cho"));
      const snap = await getDocs(q);
      setInventory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
  }

  async function loadDistributions() {
    setLoading(true);
    try {
      const q = query(collection(db, "distributions"), where("fromType", "==", "cho"));
      const snap = await getDocs(q);
      setDistributions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  // Calculate distribution across all RHUs
  function calculateDist() {
    const total = parseInt(totalBoxes);
    if (!total || total <= 0) { alert("Enter valid total boxes"); return; }
    const item = inventory.find(i => i.id === selectedInventoryId);
    if (!item) { alert("Please select a medicine"); return; }
    const avail = item.remaining ?? item.quantity;
    if (total > avail) { alert(`Only ${avail} boxes available!`); return; }
    let rem = total;
    const result = RHU_DATA.map((rhu, i) => {
      const boxes = i === RHU_DATA.length - 1
        ? rem
        : Math.round(total * rhu.populationPercent);
      rem -= boxes;
      return { ...rhu, boxes, status: "Pending" };
    });
    setCalculatedDist(result);
  }

  // Save full distribution plan to Firebase
  async function saveDistributionPlan() {
    if (calculatedDist.length === 0) return;
    setSaving(true);
    try {
      const item = inventory.find(i => i.id === selectedInventoryId);
      const total = parseInt(totalBoxes);

      const docRef = await addDoc(collection(db, "distributions"), {
        fromType: "cho",
        inventoryId: selectedInventoryId,
        medicineName: item.name,
        totalBoxes: total,
        rhuDistribution: calculatedDist,
        status: "Pending",
        createdBy: user.uid,
        createdAt: serverTimestamp(),
        date: new Date().toLocaleDateString()
      });

      // Deduct from inventory
      const newRemaining = (item.remaining ?? item.quantity) - total;
      await updateDoc(doc(db, "inventory", selectedInventoryId), { remaining: newRemaining });

      // Notify all RHUs
      for (const rhu of calculatedDist) {
        await addDoc(collection(db, "notifications"), {
          type: "distribution",
          title: "New Supply from CHO",
          message: `CHO has allocated ${rhu.boxes} boxes of ${item.name} for ${rhu.name}. Awaiting distribution.`,
          toRhuId: rhu.id,
          toRhuName: rhu.name,
          fromType: "cho",
          distributionId: docRef.id,
          read: false,
          createdAt: serverTimestamp()
        });
      }

      alert("Distribution plan created! All RHUs have been notified.");
      setShowNewModal(false);
      setSelectedInventoryId(""); setTotalBoxes(""); setCalculatedDist([]);
      loadDistributions();
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  // Mark one RHU row as distributed
  async function distributeToRHU(dist, rhuId) {
    setDistributingId(rhuId + dist.id);
    try {
      const updatedRhuDist = dist.rhuDistribution.map(r =>
        r.id === rhuId ? { ...r, status: "Distributed" } : r
      );
      const allDone = updatedRhuDist.every(r => r.status === "Distributed");

      await updateDoc(doc(db, "distributions", dist.id), {
        rhuDistribution: updatedRhuDist,
        status: allDone ? "Completed" : "Partial"
      });

      // Update notification to confirmed
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

  // Distribute to ALL RHUs in this plan at once
  async function distributeAllRHUs(dist) {
    if (!confirm(`Distribute ${dist.medicineName} to all ${dist.rhuDistribution.length} RHUs now?`)) return;
    setDistributingId("all-" + dist.id);
    try {
      const updatedRhuDist = dist.rhuDistribution.map(r => ({ ...r, status: "Distributed" }));

      await updateDoc(doc(db, "distributions", dist.id), {
        rhuDistribution: updatedRhuDist,
        status: "Completed"
      });

      // Notify each RHU
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
              {item.label}
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
          <input className="cho-search" type="text" placeholder="Search facilities, inventory, or logs..." />
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
              <h1 className="cho-page-title">Distribution Management</h1>
              <p className="cho-page-sub">Review RHU supply requests and distribute medical supplies to Rural Health Units.</p>
            </div>
            <button className="cho-btn-primary" onClick={() => setShowNewModal(true)}>
              New Distribution
            </button>
          </div>

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

          {/* Distribution Plans */}
          {loading ? (
            <div className="cho-empty-state"><p>Loading distributions...</p></div>
          ) : distributions.length === 0 ? (
            <div className="cho-empty-state">
              <div className="cho-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2z"/>
                </svg>
              </div>
              <h2 className="cho-empty-title">No Distribution Plans Yet</h2>
              <p className="cho-empty-text">Click "New Distribution" to create a plan and allocate supplies to all 10 RHUs.</p>
              <button className="cho-btn-primary" onClick={() => setShowNewModal(true)}>New Distribution</button>
            </div>
          ) : (
            distributions.map(dist => (
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
                      <th>REQUEST MEDICINE</th>
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
                              onClick={() => { setReviewDist({ dist, rhu }); setShowReviewModal(true); }}
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
            ))
          )}
        </main>
      </div>

      {/* ── New Distribution Modal ── */}
      {showNewModal && (
        <div className="cho-modal-overlay" onClick={() => setShowNewModal(false)}>
          <div className="cho-modal cho-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">New Distribution Plan</h2>
              <button className="cho-modal-close" onClick={() => setShowNewModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">
              <div className="cho-calc-inputs">
                <div className="cho-form-field">
                  <label className="cho-label">Select Medicine from Inventory</label>
                  <select className="cho-input" value={selectedInventoryId}
                    onChange={e => { setSelectedInventoryId(e.target.value); setCalculatedDist([]); }}>
                    <option value="">-- Select Medicine --</option>
                    {inventory.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.name} ({item.remaining ?? item.quantity} boxes available)
                      </option>
                    ))}
                  </select>
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Total Boxes to Distribute</label>
                  <input className="cho-input" type="number" placeholder="e.g., 180"
                    value={totalBoxes}
                    onChange={e => { setTotalBoxes(e.target.value); setCalculatedDist([]); }} />
                </div>
                <button className="cho-btn-secondary" onClick={calculateDist}>Calculate</button>
              </div>

              {calculatedDist.length > 0 && (
                <>
                  <p className="cho-dist-note">Auto-distributed by RHU population percentage:</p>
                  <table className="cho-table">
                    <thead>
                      <tr>
                        <th>RHU</th>
                        <th>POPULATION %</th>
                        <th>BOXES</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculatedDist.map(rhu => (
                        <tr key={rhu.id}>
                          <td><strong>{rhu.name}</strong></td>
                          <td>{(rhu.populationPercent * 100).toFixed(0)}%</td>
                          <td><strong>{rhu.boxes} boxes</strong></td>
                        </tr>
                      ))}
                      <tr className="cho-table-total">
                        <td colSpan={2}><strong>Total</strong></td>
                        <td><strong>{calculatedDist.reduce((s, r) => s + r.boxes, 0)} boxes</strong></td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowNewModal(false)}>Cancel</button>
              {calculatedDist.length > 0 && (
                <button className="cho-btn-primary" onClick={saveDistributionPlan} disabled={saving}>
                  {saving ? "Saving..." : "Save & Notify All RHUs"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Review Modal ── */}
      {showReviewModal && reviewDist && (
        <div className="cho-modal-overlay" onClick={() => setShowReviewModal(false)}>
          <div className="cho-modal" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">Review — {reviewDist.rhu.name}</h2>
              <button className="cho-modal-close" onClick={() => setShowReviewModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">
              <div className="cho-review-row"><span>Medicine</span><strong>{reviewDist.dist.medicineName}</strong></div>
              <div className="cho-review-row"><span>Boxes Allocated</span><strong>{reviewDist.rhu.boxes} boxes</strong></div>
              <div className="cho-review-row"><span>Status</span>
                <span className={`cho-status-badge ${reviewDist.rhu.status === "Distributed" ? "cho-status--completed" : "cho-status--pending"}`}>
                  {reviewDist.rhu.status || "Pending"}
                </span>
              </div>
              <div className="cho-review-row"><span>Date</span><strong>{reviewDist.dist.date}</strong></div>
              <div className="cho-review-row"><span>Population Share</span><strong>{(reviewDist.rhu.populationPercent * 100).toFixed(0)}%</strong></div>
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowReviewModal(false)}>Close</button>
              {reviewDist.rhu.status !== "Distributed" && (
                <button className="cho-btn-primary"
                  onClick={() => { distributeToRHU(reviewDist.dist, reviewDist.rhu.id); setShowReviewModal(false); }}>
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