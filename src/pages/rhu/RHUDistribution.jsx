import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, getDoc, deleteDoc, doc,
  serverTimestamp, query, where, updateDoc, Timestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { checkAndNotifyLowStock } from "../../utils/lowStockNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useToast } from "../../context/ToastContext";
import {
  getPriorMonthKey, monthKeyLabel, getSubmittedOwnerIds,
} from "../../utils/monthlyBalance";
import "./RHUDistribution.css";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"     },
  { label: "Inventory",     to: "/rhu/inventory"     },
  { label: "Barangay",      to: "/rhu/barangay"      },
  { label: "Distribution",  to: "/rhu/distribution"  },
  { label: "Balance Reports", to: "/rhu/balance-reports" },
  { label: "Reports",       to: "/rhu/reports"       },
  { label: "Messages",      to: "/rhu/messages"      },
  { label: "Notifications", to: "/rhu/notifications" },
];

const BARANGAYS_COLLECTION = "cho_barangays";
const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// FEFO (First-Expired, First-Out) helpers — same logic as MidwifeDispense.jsx.
function getExpiryTime(item) {
  if (!item?.expiry) return Infinity;
  const t = new Date(item.expiry).getTime();
  return isNaN(t) ? Infinity : t;
}

function sortByFEFO(items) {
  return [...items].sort((a, b) => getExpiryTime(a) - getExpiryTime(b));
}

function formatExpiry(expiry) {
  if (!expiry) return "no expiry set";
  const d = new Date(expiry);
  if (isNaN(d)) return "no expiry set";
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

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
  const { showToast } = useToast();
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

  // Custom Distribution Date State (Defaults to current local YYYY-MM-DD)
  const [distributeDate, setDistributeDate] = useState(() => new Date().toISOString().split("T")[0]);

  // New distribution modal — multi-medicine selection
  const [showNewModal, setShowNewModal]         = useState(false);
  const [selectedItems, setSelectedItems]       = useState({}); // { [inventoryId]: "boxes string" }
  const [pendingFefoItem, setPendingFefoItem] = useState(null); 
  const [calculatedPlans, setCalculatedPlans]   = useState([]); 

  // Review modal
  const [showReviewModal, setShowReviewModal]   = useState(false);
  const [reviewData, setReviewData]             = useState(null);

  // Barangays (midwives) that HAVE submitted their end-of-month "Present End
  // Balance" report for the most recently completed month. Same rule as
  // CHO -> RHU, applied one level down: RHU -> Midwife.
  const [compliantBarangayNames, setCompliantBarangayNames] = useState(new Set());
  const reportMonthKey = getPriorMonthKey();

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => {
    if (userData) {
      loadDistributions();
      loadInventory();
      loadAssignedBarangays();
      loadCompliance();
    }
  }, [userData]);

  async function loadCompliance() {
    try {
      const names = await getSubmittedOwnerIds("midwife", reportMonthKey);
      setCompliantBarangayNames(names);
    } catch (err) { console.error("Error loading midwife balance compliance:", err); }
  }

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
    setPendingFefoItem(null);
    setDistributeDate(new Date().toISOString().split("T")[0]);
  }

  function calculatePlans() {
    const entries = Object.entries(selectedItems);
    if (entries.length === 0) { showToast("Select at least one medicine to distribute.", "error"); return; }

    const populationBarangays = barangays.filter(b => b.population > 0);
    if (populationBarangays.length === 0) {
      showToast("No assigned barangay has a valid population set yet. Update population numbers in the Barangay module first.", "error");
      return;
    }

    // Validation rule: a Midwife/barangay must have submitted its "Present
    // End Balance" report for the month that just ended before this RHU can
    // send it a new replenishment.
    const activeBarangays = populationBarangays.filter(b => compliantBarangayNames.has(String(b.name).trim().toLowerCase()));
    const skippedBarangays = populationBarangays.filter(b => !compliantBarangayNames.has(String(b.name).trim().toLowerCase()));

    if (activeBarangays.length === 0) {
      showToast(
        `No barangay is eligible for replenishment yet — none have submitted their ${monthKeyLabel(reportMonthKey)} end-balance report.`,
        "error"
      );
      return;
    }
    if (skippedBarangays.length > 0) {
      showToast(
        `Skipping ${skippedBarangays.map(b => b.name).join(", ")} — missing ${monthKeyLabel(reportMonthKey)} end-balance report.`,
        "error"
      );
    }

    const populationSum = activeBarangays.reduce((s, b) => s + b.population, 0);
    if (populationSum <= 0) {
      showToast("Eligible barangays have no valid population set.", "error");
      return;
    }

    const plans = [];
    for (const [invId, boxesStr] of entries) {
      const total = parseInt(boxesStr, 10);
      const item = inventory.find(i => i.id === invId);
      if (!item) continue;
      if (!total || total <= 0) {
        showToast(`Enter a valid number of boxes for ${item.name}.`, "error");
        return;
      }
      const avail = item.remaining ?? item.quantity;
      if (total > avail) {
        showToast(`Only ${avail} boxes of ${item.name} remaining!`, "error");
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
      // Parse the custom distribution date
      const selectedDateObj = new Date(distributeDate + "T00:00:00");
      const formattedDate = selectedDateObj.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric"
      });
      const customTimestamp = Timestamp.fromDate(selectedDateObj);

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
          isVaccine:            !!plan.item.isVaccine,
          doseType:             plan.item.doseType ?? "",
          dosesPerVial:         plan.item.dosesPerVial ?? 0,
          fhsisAntigen:         plan.item.fhsisAntigen ?? "",
          totalBoxes:           plan.totalBoxes,
          barangayDistribution: plan.dist,
          status:               "Pending",
          createdBy:            user?.uid ?? "",
          createdAt:            customTimestamp,
          date:                 formattedDate
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

      showToast(`Distribution plan${calculatedPlans.length > 1 ? "s" : ""} saved! Barangays notified.`, "success");
      setShowNewModal(false);
      resetNewModal();
      loadDistributions();
      loadInventory();
    } catch (err) { showToast("Error: " + err.message, "error"); }
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

      // Preserve distribution date timestamp for midwife inventory record
      const distDateObj = dist.date ? new Date(dist.date) : new Date();
      const recordTimestamp = isNaN(distDateObj.getTime()) ? serverTimestamp() : Timestamp.fromDate(distDateObj);

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
        isVaccine:      !!dist.isVaccine,
        doseType:       dist.doseType ?? "",
        dosesPerVial:   dist.dosesPerVial ?? 0,
        fhsisAntigen:   dist.fhsisAntigen ?? "",
        createdAt:      recordTimestamp,
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
    } catch (err) { showToast("Error: " + err.message, "error"); }
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

      const distDateObj = dist.date ? new Date(dist.date) : new Date();
      const recordTimestamp = isNaN(distDateObj.getTime()) ? serverTimestamp() : Timestamp.fromDate(distDateObj);

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
          isVaccine:      !!dist.isVaccine,
          doseType:       dist.doseType ?? "",
          dosesPerVial:   dist.dosesPerVial ?? 0,
          fhsisAntigen:   dist.fhsisAntigen ?? "",
          createdAt:      recordTimestamp,
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

      showToast("Distributed to all barangays successfully!", "success");
      loadDistributions();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setDistributingId(null);
  }

  async function deleteDistribution(id) {
    if (!confirm("Delete this distribution?")) return;
    try {
      await deleteDoc(doc(db, "rhu_distributions", id));
      setDistributions(distributions.filter(d => d.id !== id));
    } catch (err) { showToast("Error: " + err.message, "error"); }
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

  const distributableInventory = inventory.filter(i => (i.remaining ?? i.quantity ?? 0) > 0);
  const fefoGroups = {};
  distributableInventory.forEach(item => {
    const key = item.name || "Unnamed";
    if (!fefoGroups[key]) fefoGroups[key] = [];
    fefoGroups[key].push(item);
  });
  Object.keys(fefoGroups).forEach(name => { fefoGroups[name] = sortByFEFO(fefoGroups[name]); });

  function handleMedicineCheck(item, checked) {
    if (checked) {
      const group = fefoGroups[item.name || "Unnamed"] || [];
      const recommended = group[0];
      const needsWarning = recommended
        && recommended.id !== item.id
        && (recommended.remaining ?? recommended.quantity ?? 0) > 0;
      if (needsWarning) {
        setPendingFefoItem({ item, recommended });
        return;
      }
    }
    toggleMedicine(item.id, checked);
  }

  function confirmFefoAndProceed() {
    toggleMedicine(pendingFefoItem.item.id, true);
    setPendingFefoItem(null);
  }

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
              <NavLink to="/rhu/settings" className="rhu-nav-item rhu-nav-btn">Settings</NavLink>
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
                <button className="rhu-notif-btn" aria-label="Notifications" onClick={() => navigate("/rhu/notifications")} style={{ position: "relative" }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="20" height="20">
                    <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                  {Boolean(unreadCount) && (
                    <span className="nav-badge" style={{ position: "absolute", top: "-4px", right: "-4px" }}>
                      {unreadCount}
                    </span>
                  )}
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
                  <button className="rhu-btn-secondary" onClick={() => navigate("/rhu/balance-reports")}>
                    Review Midwife Balance Reports
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

      {pendingFefoItem && (
        <div className="rhu-modal-overlay" style={{ zIndex: 1100 }} onClick={() => setPendingFefoItem(null)}>
          <div className="rhu-modal" style={{ maxWidth: "440px" }} onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">⚠ Not the recommended lot</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => setPendingFefoItem(null)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <p className="rhu-dist-note">
                Lot <strong>{pendingFefoItem.recommended.lotNumber || "—"}</strong> of {pendingFefoItem.item.name} {
                  formatExpiry(pendingFefoItem.recommended.expiry) === formatExpiry(pendingFefoItem.item.expiry)
                    ? "expires on the same date but is"
                    : `expires sooner (${formatExpiry(pendingFefoItem.recommended.expiry)}) and is`
                } the recommended lot to distribute first (FEFO).
              </p>
              <p className="rhu-dist-note" style={{ marginTop: "8px" }}>
                You're about to select Lot <strong>{pendingFefoItem.item.lotNumber || "—"}</strong> instead. Continue anyway?
              </p>
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setPendingFefoItem(null)}>Cancel</button>
              <button className="rhu-btn-primary" onClick={confirmFefoAndProceed}>Continue Anyway</button>
            </div>
          </div>
        </div>
      )}

      {/* ── New Distribution Modal (multi-medicine) ── */}
      {showNewModal && (
        <div className="rhu-modal-overlay" onClick={() => { setShowNewModal(false); resetNewModal(); }}>
          <div className="rhu-modal rhu-modal--lg" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">New Distribution</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => { setShowNewModal(false); resetNewModal(); }}>×</button>
            </div>
            <div className="rhu-modal-body">

              <div style={{ marginBottom: "16px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "600", marginBottom: "4px" }}>
                  Distribution Date
                </label>
                <input
                  type="date"
                  className="cho-input"
                  value={distributeDate}
                  onChange={e => setDistributeDate(e.target.value)}
                  style={{ width: "100%", maxWidth: "220px" }}
                />
              </div>

              <p className="rhu-dist-note">Select one or more medicines and enter how many boxes of each to distribute.</p>
              <p style={{ fontSize: "12px", color: "#6b7280", margin: "-4px 0 10px" }}>
                ★ marks the lot expiring soonest for each medicine — distribute that one first (FEFO).
              </p>

              <div className="rhu-med-select-list">
                {(() => {
                  const sortedInventory = Object.keys(fefoGroups)
                    .sort((a, b) => a.localeCompare(b))
                    .flatMap(name => fefoGroups[name]);

                  return sortedInventory.map((item) => {
                    const checked = item.id in selectedItems;
                    const avail = item.remaining ?? item.quantity;
                    const group = fefoGroups[item.name || "Unnamed"] || [];
                    const isEarliestInGroup = group[0]?.id === item.id;
                    return (
                      <div
                        className={`rhu-med-select-row ${checked ? "rhu-med-select-row--active" : ""}`}
                        style={isEarliestInGroup ? { background: "#fffbeb" } : undefined}
                        key={item.id}
                      >
                        <label className="rhu-med-checkbox-label">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={e => handleMedicineCheck(item, e.target.checked)}
                          />
                          <span className="rhu-med-checkbox-text">
                            <strong>{isEarliestInGroup ? "★ " : ""}{item.name} — Lot {item.lotNumber || "—"}</strong>
                            <span className="rhu-med-checkbox-sub">
                              Expires {formatExpiry(item.expiry)} · {avail} boxes available
                              {isEarliestInGroup ? " · dispense first (FEFO)" : ""}
                            </span>
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
                  });
                })()}
                {distributableInventory.length === 0 && (
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

              <p className="rhu-dist-note" style={{ color: compliantBarangayNames.size < barangays.filter(b => b.population > 0).length ? "#b45309" : "#166534" }}>
                {compliantBarangayNames.size} of {barangays.filter(b => b.population > 0).length} population-registered barangays have submitted their {monthKeyLabel(reportMonthKey)} end-balance report and are eligible for this replenishment.
              </p>

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