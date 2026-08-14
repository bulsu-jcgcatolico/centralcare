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

const BARANGAYS_COLLECTION = "cho_barangays";
const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function getMonthYear(dateStr, seconds) {
  let d = null;
  if (seconds) {
    d = new Date(seconds * 1000);
  } else if (dateStr) {
    d = new Date(dateStr);
  }
  if (!d || isNaN(d.getTime())) return null;
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export default function RHUDistribution() {
  const { logout, user, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [distributions, setDistributions]   = useState([]);
  const [inventory, setInventory]           = useState([]);
  const [loading, setLoading]               = useState(false);
  const [saving, setSaving]                 = useState(false);
  const [distributingId, setDistributingId] = useState(null);

  const [barangays, setBarangays]            = useState([]);

  // Filtering and Search states
  const [searchTerm, setSearchTerm]         = useState("");
  const [selectedMonth, setSelectedMonth]   = useState("all"); 

  // New distribution modal — multi-medicine selection
  const [showNewModal, setShowNewModal]         = useState(false);
  const [selectedItems, setSelectedItems]       = useState({}); // { [inventoryId]: "boxes string" }
  const [calculatedPlans, setCalculatedPlans]   = useState([]); // [{ inventoryId, item, totalBoxes, dist }]

  // Review modal
  const [showReviewModal, setShowReviewModal]   = useState(false);
  const [reviewData, setReviewData]             = useState(null);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => {
    if (userData) {
      loadDistributions();
      loadInventory();
      loadAssignedBarangays();
    }
  }, [userData]);

  async function loadInventory() {
    try {
      const q = query(
        collection(db, "inventory"),
        where("ownerType", "==", "rhu")
      );
      const snap = await getDocs(q);
      const userRhuId = String(userData?.rhuId || "").trim().toLowerCase();
      const userRhuName = String(userData?.rhuName || userData?.assignedRhu || "").trim().toLowerCase();

      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => {
          const itemRhuId = String(item.rhuId || "").trim().toLowerCase();
          const itemRhuName = String(item.rhuName || item.assignedRhu || "").trim().toLowerCase();
          
          const matchesRhu = (userRhuId !== "" && itemRhuId === userRhuId) ||
                             (userRhuName !== "" && itemRhuName === userRhuName);

          const status = String(item.receivedStatus || item.status || "").trim().toLowerCase();
          const isAccepted = status === "accepted";

          return matchesRhu && isAccepted;
        });

      setInventory(list);
    } catch (err) { console.error("Error loading inventory:", err); }
  }

  async function loadDistributions() {
    setLoading(true);
    try {
      const q = query(collection(db, "rhu_distributions"));
      const snap = await getDocs(q);
      const userRhuId = String(userData?.rhuId || "").trim().toLowerCase();
      const userRhuName = String(userData?.rhuName || "").trim().toLowerCase();

      const list = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(d => {
          const fromId = String(d.fromRhuId || "").trim().toLowerCase();
          const fromName = String(d.fromRhuName || "").trim().toLowerCase();
          return (userRhuId !== "" && fromId === userRhuId) ||
                 (userRhuName !== "" && fromName === userRhuName);
        });

      setDistributions(list);
    } catch (err) { console.error("Error loading distributions:", err); }
    setLoading(false);
  }

  async function loadAssignedBarangays() {
    try {
      const rhuId = String(userData?.rhuId ?? "").trim();
      if (!rhuId) {
        setBarangays([]);
        return;
      }

      const registrySnap = await getDoc(doc(db, RHU_REGISTRY_COLLECTION, rhuId));
      const assignedNames = registrySnap.exists()
        ? (registrySnap.data().assignedBarangays || [])
        : [];

      if (assignedNames.length === 0) {
        setBarangays([]);
        return;
      }

      const allBarangaysSnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
      const allBarangays = allBarangaysSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      
      const assigned = allBarangays
        .filter(b => assignedNames.includes(b.barangayName))
        .map(b => ({
          id: b.id,
          name: b.barangayName,
          population: Number(b.totalPopulation ?? b.population ?? b.populationPercent ?? 0)
        }));

      setBarangays(assigned);
    } catch (err) {
      console.error("Error loading assigned barangays:", err);
      setBarangays([]);
    }
  }

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

  function calculatePlans() {
    const entries = Object.entries(selectedItems);
    if (entries.length === 0) { alert("Select at least one medicine to distribute."); return; }

    const activeBarangays = barangays.filter(b => b.population > 0);
    const populationSum = activeBarangays.reduce((s, b) => s + b.population, 0);

    if (activeBarangays.length === 0 || populationSum <= 0) {
      alert("No assigned barangay has a valid population set yet. Update population numbers in the Barangay module first.");
      return;
    }

    const plans = [];
    for (const [invId, boxesStr] of entries) {
      const total = parseInt(boxesStr, 10);
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
        const computedSharePercent = (b.population / populationSum);
        const boxes = i === activeBarangays.length - 1
          ? rem
          : Math.round(total * computedSharePercent);
        rem -= boxes;
        return {
          id: b.id,
          name: b.name,
          boxes,
          population: b.population,
          sharePercent: (computedSharePercent * 100).toFixed(1),
          status: "Pending"
        };
      });
      plans.push({ inventoryId: invId, item, totalBoxes: total, dist });
    }
    setCalculatedPlans(plans);
  }

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
          productKey:           plan.item.productKey ?? "",
          category:             plan.item.category ?? "",
          subCategory:          plan.item.subCategory ?? "",
          lotNumber:            plan.item.lotNumber ?? "",
          expiry:               plan.item.expiry ?? "",
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
          await addDoc(collection(db, "notifications"), {
            type:           "distribution",
            title:          "New Supply Allocated from RHU",
            message:        `${userData?.rhuName || "RHU"} has allocated ${b.boxes} boxes of ${plan.item.name} for ${b.name} barangay. Accept it in your Distribution/Inventory module.`,
            toBarangayName: b.name,
            fromRhuId:      userData?.rhuId  ?? "",
            fromRhuName:    userData?.rhuName ?? "",
            distributionId: docRef.id,
            read:           false,
            createdAt:      serverTimestamp()
          });
        }
      }

      alert(`Distribution plan${calculatedPlans.length > 1 ? "s" : ""} saved! Barangays notified.`);
      setShowNewModal(false);
      resetNewModal();
      loadDistributions();
      loadInventory();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

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

      await addDoc(collection(db, "inventory"), {
        productKey:     dist.productKey ?? "",
        name:           dist.medicineName,
        category:       dist.category ?? "",
        subCategory:    dist.subCategory ?? "",
        lotNumber:      dist.lotNumber ?? "",
        quantity:       b.boxes,
        remaining:      b.boxes,
        expiry:         dist.expiry ?? "",
        source:         "RHU",
        ownerType:      "midwife",
        barangayName:   b.name,
        fromRhuId:      userData?.rhuId  ?? "",
        fromRhuName:    userData?.rhuName ?? "",
        distributionId: dist.id,
        receivedStatus: "Accepted",
        createdAt:      serverTimestamp(),
      });

      await addDoc(collection(db, "notifications"), {
        type:           "distribution",
        title:          "Supply Dispatched",
        message:        `Your ${b.boxes} boxes of ${dist.medicineName} have been dispatched and added to your inventory by ${userData?.rhuName || "RHU"}.`,
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
        await addDoc(collection(db, "inventory"), {
          productKey:     dist.productKey ?? "",
          name:           dist.medicineName,
          category:       dist.category ?? "",
          subCategory:    dist.subCategory ?? "",
          lotNumber:      dist.lotNumber ?? "",
          quantity:       b.boxes,
          remaining:      b.boxes,
          expiry:         dist.expiry ?? "",
          source:         "RHU",
          ownerType:      "midwife",
          barangayName:   b.name,
          fromRhuId:      userData?.rhuId  ?? "",
          fromRhuName:    userData?.rhuName ?? "",
          distributionId: dist.id,
          receivedStatus: "Accepted",
          createdAt:      serverTimestamp(),
        });

        await addDoc(collection(db, "notifications"), {
          type:           "distribution",
          title:          "Supply Dispatched",
          message:        `Your ${b.boxes} boxes of ${dist.medicineName} have been dispatched and added to your inventory by ${userData?.rhuName || "RHU"}.`,
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

  // Derive available months for dropdown filter
  const allMonths = [...new Set(distributions.map(d => getMonthYear(d.date, d.createdAt?.seconds)).filter(Boolean))].sort().reverse();

  // Filter Logic for Search Term and Month Filter
  const filteredDistributions = distributions.filter(d => {
    const matchesSearch = 
      d.medicineName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.barangayDistribution?.some(b => b.name.toLowerCase().includes(searchTerm.toLowerCase()));

    let matchesMonth = true;
    if (selectedMonth !== "all") {
      const itemMonth = getMonthYear(d.date, d.createdAt?.seconds);
      matchesMonth = itemMonth === selectedMonth;
    }

    return matchesSearch && matchesMonth;
  });

  const pendingCount      = filteredDistributions.filter(d => d.status === "Pending" || d.status === "Partial").length;
  const totalDistributed  = filteredDistributions.reduce((s, d) => s + (d.totalBoxes || 0), 0);
  const tableRows         = filteredDistributions.slice().sort((a, b) =>
    (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
  );
  const grandTotalBoxes   = calculatedPlans.reduce((s, p) => s + p.totalBoxes, 0);

  const totalAssignedPopulation = barangays.reduce((sum, b) => sum + b.population, 0);
  const periodLabel = selectedMonth === "all" ? "All time" : selectedMonth;

  return (
    <div>
      {/* ════════════════════ NORMAL SCREEN VIEW ════════════════════ */}
      <div className="cho-screen-only">
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
                  {item.label === "Notifications" && Boolean(unreadCount) && (
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
                placeholder="Search for barangays, supplies or records..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                aria-label="Search" />

              <div className="rhu-topbar-right">
                <button className="rhu-notif-btn" aria-label="Notifications">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                </button>
                <div className="rhu-user">
                  <div className="rhu-user-info">
                    <span className="rhu-user-name">{userData?.username || "RHU Admin"}</span>
                  </div>
                  <div className="rhu-avatar">RH</div>
                </div>
              </div>
            </header>

            <main className="rhu-content">
              {/* Row 1: Page Title/Subtitle */}
              <div className="rhu-page-header">
                <h1 className="rhu-page-title">RHU Distribution</h1>
                <p className="rhu-page-sub">Manage and allocate medical supplies across barangay health centers.</p>
              </div>

              {/* Row 2: Filter and Print/Export (Left) & Actions (Right) Aligned Together */}
              <div className="rhu-filter-export-row">
                <div className="rhu-filter-group">
                  <select 
                    id="monthFilterSelect"
                    className="cho-input rhu-month-filter-select" 
                    value={selectedMonth} 
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    aria-label="Filter by month"
                  >
                    <option value="all">All Months</option>
                    {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>

                  <button className="cho-btn-export-pdf" onClick={() => window.print()} title="Print or Export PDF">
                    Print / Export PDF
                  </button>
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
                  <h2 className="rhu-empty-title">No Distribution Plans Found</h2>
                  <p className="rhu-empty-text">Try adjusting your search terms or month filter, or click "New Distribution".</p>
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
        </div>
      </div>

      {/* ════════════════════ PRINT-ONLY VIEW ════════════════════ */}
      <div className="cho-print-only" style={{ display: "none" }}>
        <div style={{ fontFamily: "Arial, sans-serif", color: "#000", padding: "20px" }}>
          <h1 style={{ fontSize: "20px", margin: "0 0 4px" }}>RHU Distribution Report</h1>
          <p style={{ fontSize: "12px", color: "#333", margin: "0 0 16px" }}>
            {userData?.rhuName || "RHU Unit"} — {periodLabel}
          </p>

          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <tbody>
              <tr>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Pending Distribution:</strong> {pendingCount}
                </td>
                <td style={{ border: "1px solid #999", padding: "8px", fontSize: "12px" }}>
                  <strong>Total Distributed (boxes):</strong> {totalDistributed.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>

          {tableRows.length === 0 ? (
            <p style={{ fontSize: "13px" }}>No distribution records for {periodLabel}.</p>
          ) : (
            tableRows.map(dist => (
              <div key={dist.id} style={{ marginBottom: "15px" }}>
                <h3 style={{ fontSize: "13px", margin: "0 0 5px" }}>
                  {dist.medicineName} — {dist.totalBoxes} boxes ({dist.date}) [Status: {dist.status}]
                </h3>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
                  <thead>
                    <tr>
                      <th style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>Barangay</th>
                      <th style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>Boxes</th>
                      <th style={{ border: "1px solid #999", padding: "6px", textAlign: "left", background: "#eee" }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dist.barangayDistribution || []).map(b => (
                      <tr key={b.id}>
                        <td style={{ border: "1px solid #999", padding: "6px" }}>{b.name}</td>
                        <td style={{ border: "1px solid #999", padding: "6px" }}>{b.boxes} boxes</td>
                        <td style={{ border: "1px solid #999", padding: "6px" }}>{b.status || "Pending"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </div>
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
                  <p className="rhu-dist-note">No accepted medicines in inventory available for distribution.</p>
                )}
              </div>

              {/* Read-only summary of configured barangays */}
              <div className="rhu-barangay-summary">
                <div className="rhu-barangay-summary-header">
                  <span>Distributing across {barangays.length} barangay{barangays.length !== 1 ? "s" : ""}</span>
                  <button type="button" className="rhu-link-btn" onClick={() => navigate("/rhu/barangay")}>
                    Edit barangays
                  </button>
                </div>
                <div className="rhu-barangay-summary-chips">
                  {barangays.map(b => {
                    const pct = totalAssignedPopulation > 0
                      ? ((b.population / totalAssignedPopulation) * 100).toFixed(1)
                      : "0.0";
                    return (
                      <span className="rhu-barangay-chip" key={b.id}>
                        {b.name} · {pct}%
                      </span>
                    );
                  })}
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
                              <th>POP SHARE %</th>
                              <th>BOXES TO RECEIVE</th>
                            </tr>
                          </thead>
                          <tbody>
                            {plan.dist.map(b => (
                              <tr key={b.id}>
                                <td><strong>{b.name}</strong></td>
                                <td>{b.sharePercent}%</td>
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
              {reviewData.b.sharePercent && (
                <div className="rhu-review-row">
                  <span>Population Share</span>
                  <strong>{reviewData.b.sharePercent}%</strong>
                </div>
              )}
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

      <style>{`
        @media print {
          .cho-screen-only { display: none !important; }
          .cho-print-only  { display: block !important; }
        }
      `}</style>
    </div>
  );
}