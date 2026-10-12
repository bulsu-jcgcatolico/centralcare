import { useState, useEffect, useRef } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, getDocs, getDoc, doc,
  serverTimestamp, query, where, updateDoc, Timestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { checkAndNotifyLowStock } from "../../utils/lowStockNotifier";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
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

// Today as YYYY-MM-DD in LOCAL time. (toISOString() is UTC, which is still
// "yesterday" in the Philippines between midnight and 8 AM.)
function todayLocalISO() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  const t = new Date(ts).getTime();
  return isNaN(t) ? 0 : t;
}

// The calendar day a distribution is dated for (local midnight).
function getDistributionDay(d) {
  let t = toMillis(d.createdAt);
  if (!t && d.date) {
    const p = new Date(d.date).getTime();
    t = isNaN(p) ? 0 : p;
  }
  if (!t) return 0;
  const day = new Date(t);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

// When the record was actually entered. New records carry savedAt; older ones
// fall back to createdAt.
function getEntryTime(d) {
  return toMillis(d.savedAt) || toMillis(d.createdAt);
}

// Newest delivery date first; on the same day, most recently entered first.
function sortNewestFirst(a, b) {
  return getDistributionDay(b) - getDistributionDay(a) || getEntryTime(b) - getEntryTime(a);
}

export default function RHUDistribution() {
  const { logout, user, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const unreadMessages = useUnreadMessageCount();

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
  const [distributeDate, setDistributeDate] = useState(todayLocalISO);

  // New distribution modal — multi-medicine selection
  const [showNewModal, setShowNewModal]         = useState(false);
  const [selectedItems, setSelectedItems]       = useState({}); // { [inventoryId]: "boxes string" }
  const [pendingFefoItem, setPendingFefoItem] = useState(null); 
  const [calculatedPlans, setCalculatedPlans]   = useState([]); 
  const resultsRef = useRef(null);

  useEffect(() => {
    if (calculatedPlans.length > 0 && resultsRef.current) {
      // Calculate's own results land below Step 4's text in the right column —
      // scroll them into view automatically instead of leaving the person to
      // notice a plan appeared only by scrolling further themselves.
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [calculatedPlans]);

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
      const normalizedAssignedNames = assignedNames.map(n => String(n).trim().toLowerCase());

      const assigned = allBarangays
        .filter(b => normalizedAssignedNames.includes(String(b.barangayName).trim().toLowerCase()))
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
    setDistributeDate(todayLocalISO());
  }

  function closeNewModal() {
    setShowNewModal(false);
    resetNewModal();
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
          savedAt:              serverTimestamp(), // real entry time — createdAt only holds the delivery DATE
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
        receivedStatus: "Pending", // awaiting the midwife's own Confirm Receipt — RHU clicking Distribute isn't the same as the stock actually arriving
        isVaccine:      !!dist.isVaccine,
        doseType:       dist.doseType ?? "",
        dosesPerVial:   dist.dosesPerVial ?? 0,
        fhsisAntigen:   dist.fhsisAntigen ?? "",
        createdAt:      recordTimestamp,
      });

      await addDoc(collection(db, "notifications"), {
        type:           "distribution",
        title:          "Supply Dispatched — Confirm Receipt",
        message:        `${b.boxes} boxes of ${dist.medicineName} have been dispatched by ${userData?.rhuName || "RHU"}. Please confirm receipt in your Inventory once it arrives.`,
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
          receivedStatus: "Pending", // awaiting the midwife's own Confirm Receipt — RHU clicking Distribute isn't the same as the stock actually arriving
          isVaccine:      !!dist.isVaccine,
          doseType:       dist.doseType ?? "",
          dosesPerVial:   dist.dosesPerVial ?? 0,
          fhsisAntigen:   dist.fhsisAntigen ?? "",
          createdAt:      recordTimestamp,
        });

        await addDoc(collection(db, "notifications"), {
          type:           "distribution",
          title:          "Supply Dispatched — Confirm Receipt",
          message:        `${b.boxes} boxes of ${dist.medicineName} have been dispatched by ${userData?.rhuName || "RHU"}. Please confirm receipt in your Inventory once it arrives.`,
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
  const tableRows         = filteredDistributions.slice().sort(sortNewestFirst);
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

  // ── New Distribution modal: values shown in the UI ──
  const populationBarangays = barangays.filter(b => b.population > 0);
  const isBarangayEligible  = b => compliantBarangayNames.has(String(b.name).trim().toLowerCase());
  const eligibleBarangays   = populationBarangays.filter(isBarangayEligible);
  const eligiblePopulation  = eligibleBarangays.reduce((s, b) => s + b.population, 0);
  const reportLabel         = monthKeyLabel(reportMonthKey);

  const recipients = barangays.map(b => {
    const hasPop   = b.population > 0;
    const eligible = hasPop && isBarangayEligible(b);
    const share    = eligible && eligiblePopulation > 0
      ? ((b.population / eligiblePopulation) * 100).toFixed(1)
      : null;
    return { ...b, hasPop, eligible, share };
  });

  let eligibility = null;
  if (barangays.length > 0) {
    if (populationBarangays.length === 0) {
      eligibility = { tone: "warn", text: "No assigned barangay has a population set yet. Add population numbers in the Barangay module first." };
    } else if (eligibleBarangays.length === 0) {
      eligibility = {
        tone: "danger",
        text: `No barangay is eligible yet — none have submitted their ${reportLabel} end-balance report.`,
        action: { label: "Review balance reports", to: "/rhu/balance-reports" },
      };
    } else if (eligibleBarangays.length < populationBarangays.length) {
      const skipped = populationBarangays.length - eligibleBarangays.length;
      eligibility = {
        tone: "warn",
        text: `${eligibleBarangays.length} of ${populationBarangays.length} barangays are eligible. The other ${skipped} will be skipped until they submit their ${reportLabel} end-balance report.`,
      };
    } else {
      eligibility = { tone: "ok", text: `All ${populationBarangays.length} barangays submitted their ${reportLabel} end-balance report and are eligible.` };
    }
  }

  const selectedEntries = Object.entries(selectedItems);
  const selectedCount   = selectedEntries.length;
  const selectedBoxes   = selectedEntries.reduce((s, [, v]) => s + (parseInt(v, 10) || 0), 0);

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
                  {item.label === "Messages" && Boolean(unreadMessages) && (
                    <span className="nav-badge">{unreadMessages}</span>
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

      {/* ── New Distribution Modal ── */}
      {showNewModal && (
        <div className="rhu-modal-overlay" onClick={closeNewModal}>
          <div
            className="rhd-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rhd-title"
            onClick={e => e.stopPropagation()}
          >
            <header className="rhd-header">
              <div>
                <h2 className="rhd-title" id="rhd-title">New Distribution</h2>
                <p className="rhd-subtitle">Allocate RHU stock to your barangays, split by population share.</p>
              </div>
              <button type="button" className="rhd-close" aria-label="Close" onClick={closeNewModal}>
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="6" y1="6" x2="18" y2="18" />
                  <line x1="18" y1="6" x2="6" y2="18" />
                </svg>
              </button>
            </header>

            <div className="rhd-body">
              {/* ── Left: delivery details ── */}
              <div className="rhd-side">
                <section className="rhd-card">
                  <h3 className="rhd-step"><span className="rhd-step-num">1</span>Delivery date</h3>
                  <input
                    type="date"
                    className="rhd-input"
                    value={distributeDate}
                    onChange={e => setDistributeDate(e.target.value)}
                    aria-label="Delivery date"
                  />
                </section>

                <section className="rhd-card">
                  <h3 className="rhd-step"><span className="rhd-step-num">2</span>Recipients</h3>

                  {eligibility && (
                    <div className={`rhd-alert rhd-alert--${eligibility.tone}`} role="status">
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="16" x2="12" y2="12" />
                        <line x1="12" y1="8" x2="12.01" y2="8" />
                      </svg>
                      <div>
                        {eligibility.text}
                        {eligibility.action && (
                          <>
                            {" "}
                            <button type="button" className="rhd-link" onClick={() => navigate(eligibility.action.to)}>
                              {eligibility.action.label}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="rhd-recip-head">
                    <span>{barangays.length} barangay{barangays.length !== 1 ? "s" : ""}</span>
                    <button type="button" className="rhd-link" onClick={() => navigate("/rhu/barangay")}>
                      Edit barangays
                    </button>
                  </div>

                  {barangays.length === 0 ? (
                    <p className="rhd-empty">No barangays are assigned to this RHU yet.</p>
                  ) : (
                    <ul className="rhd-recip-list">
                      {recipients.map(b => (
                        <li className="rhd-recip" key={b.id}>
                          <span className="rhd-recip-name">{b.name}</span>
                          <span className="rhd-recip-right">
                            {b.share !== null && <span className="rhd-recip-share">{b.share}%</span>}
                            <span className={`rhd-pill rhd-pill--${b.eligible ? "ok" : b.hasPop ? "warn" : "muted"}`}>
                              {b.eligible ? "Eligible" : b.hasPop ? "No report" : "No population"}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* ── Right: medicines + plan ── */}
              <div className="rhd-main">
                <section className="rhd-card">
                  <h3 className="rhd-step"><span className="rhd-step-num">3</span>Medicines to send</h3>
                  <p className="rhd-help">
                    Tick each lot you want to send, then enter the number of boxes. Yellow rows marked ★{" "}
                    <span className="rhd-badge">Use first</span> are the lots expiring soonest — send those
                    out first so nothing goes to waste (FEFO).
                  </p>

                  {Object.keys(fefoGroups).sort((a, b) => a.localeCompare(b)).map(name => {
                    const group = fefoGroups[name];
                    return (
                      <div className="rhd-med-group" key={name}>
                        <div className="rhd-med-group-head">
                          <span>{name}</span>
                          <span className="rhd-med-group-count">{group.length} lot{group.length !== 1 ? "s" : ""}</span>
                        </div>
                        {group.map((item, idx) => {
                          const checked = item.id in selectedItems;
                          const avail = item.remaining ?? item.quantity ?? 0;
                          const val = selectedItems[item.id] ?? "";
                          const n = parseInt(val, 10);
                          const invalid = checked && val !== "" && (!n || n <= 0 || n > avail);
                          return (
                            <div
                              className={`rhd-lot${idx === 0 ? " rhd-lot--first" : ""}${checked ? " rhd-lot--active" : ""}`}
                              key={item.id}
                            >
                              <label className="rhd-lot-main">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => handleMedicineCheck(item, e.target.checked)}
                                />
                                <span>
                                  <span className="rhd-lot-title">
                                    {idx === 0 ? "★ " : ""}Lot {item.lotNumber || "—"}
                                    {idx === 0 && <span className="rhd-badge">Use first</span>}
                                  </span>
                                  <span className="rhd-lot-meta">
                                    Expires {formatExpiry(item.expiry)} · {avail} boxes available
                                  </span>
                                </span>
                              </label>
                              {checked && (
                                <div className="rhd-boxes">
                                  <input
                                    className={`rhd-input rhd-input--sm${invalid ? " rhd-input--error" : ""}`}
                                    type="number"
                                    min="1"
                                    max={avail}
                                    placeholder="Boxes"
                                    value={val}
                                    autoFocus
                                    onChange={e => updateMedicineBoxes(item.id, e.target.value)}
                                    aria-label={`Boxes of ${item.name} to distribute`}
                                  />
                                  <span className={`rhd-boxes-hint${invalid ? " rhd-boxes-hint--error" : ""}`}>
                                    {invalid ? `Max ${avail}` : `of ${avail}`}
                                  </span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}

                  {distributableInventory.length === 0 && (
                    <p className="rhd-empty">No accepted medicines in inventory are available for distribution.</p>
                  )}
                </section>

                <section className="rhd-card" ref={resultsRef}>
                  <h3 className="rhd-step"><span className="rhd-step-num">4</span>Review the plan</h3>
                  {calculatedPlans.length === 0 ? (
                    <p className="rhd-help rhd-help--flush">
                      Select your medicines, then press <strong>Calculate Distribution</strong>. The split by
                      barangay will appear here for you to check before saving.
                    </p>
                  ) : (
                    <>
                      <p className="rhd-help">Boxes are split by each eligible barangay's share of the population.</p>
                      {calculatedPlans.map(plan => (
                        <div className="rhd-plan-card" key={plan.inventoryId}>
                          <div className="rhd-plan-head">
                            <span>
                              {plan.item.name}
                              <span className="rhd-plan-lot">Lot {plan.item.lotNumber || "—"}</span>
                            </span>
                            <span>{plan.totalBoxes} boxes</span>
                          </div>
                          <div className="rhd-table-scroll">
                            <table className="rhd-table">
                              <thead>
                                <tr>
                                  <th>Barangay</th>
                                  <th className="num">Pop. share</th>
                                  <th className="num">Boxes</th>
                                </tr>
                              </thead>
                              <tbody>
                                {plan.dist.map(b => (
                                  <tr key={b.id}>
                                    <td>{b.name}</td>
                                    <td className="num">{b.sharePercent}%</td>
                                    <td className="num"><strong>{b.boxes}</strong></td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot>
                                <tr>
                                  <td colSpan={2}>Total</td>
                                  <td className="num">{plan.dist.reduce((s, b) => s + b.boxes, 0)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      ))}
                      <div className="rhd-grand">
                        <span>Grand total</span>
                        <strong>
                          {grandTotalBoxes} boxes across {calculatedPlans.length} item{calculatedPlans.length > 1 ? "s" : ""}
                        </strong>
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>

            <footer className="rhd-footer">
              <p className="rhd-footer-summary">
                {selectedCount === 0 ? (
                  "No medicines selected yet"
                ) : (
                  <>
                    <strong>{selectedCount}</strong> item{selectedCount !== 1 ? "s" : ""} selected
                    {selectedBoxes > 0 && <> · <strong>{selectedBoxes}</strong> boxes</>}
                  </>
                )}
              </p>
              <div className="rhd-footer-actions">
                <button type="button" className="rhd-btn rhd-btn--secondary" onClick={closeNewModal}>
                  Cancel
                </button>
                {calculatedPlans.length > 0 ? (
                  <button type="button" className="rhd-btn rhd-btn--primary" onClick={saveDistributionPlan} disabled={saving}>
                    {saving ? "Saving..." : "Save & Notify Barangays"}
                  </button>
                ) : (
                  <button type="button" className="rhd-btn rhd-btn--primary" onClick={calculatePlans}>
                    Calculate Distribution
                  </button>
                )}
              </div>
            </footer>
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

        /* The clipping was actually the outer distribution card, not the
           table wrapper inside it — an ancestor with overflow:hidden clips
           its children no matter what overflow the child itself uses. */
        .rhu-dist-plan {
          max-height: none !important;
          height: auto !important;
          overflow: visible !important;
        }

        /* Let the distribution table expand to fit every row instead of
           clipping the last one inside a fixed-height scrollbox. */
        .rhu-table-wrapper {
          max-height: none !important;
          height: auto !important;
          overflow-y: visible !important;
          overflow-x: auto !important;
        }

        /* ═══ New Distribution modal ═══════════════════════════════════════
           Self-contained (rhd-*) so the shared .rhu-modal / .rhu-calc-btn
           rules in RHUDistribution.css can't squeeze it. The whole body
           scrolls as ONE area; header and footer stay pinned. */
        .rhd-modal {
          width: 100%;
          max-width: 1000px;
          max-height: 90vh;
          display: flex;
          flex-direction: column;
          background: #ffffff;
          border-radius: 16px;
          box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
          overflow: hidden;
          font-size: 14px;
          line-height: 1.5;
          color: #334155;
        }
        .rhd-modal button,
        .rhd-modal input { font-family: inherit; }

        .rhd-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          padding: 20px 24px 16px;
          border-bottom: 1px solid #e2e8f0;
          background: #ffffff;
        }
        .rhd-title { margin: 0; font-size: 18px; font-weight: 700; line-height: 1.3; color: #0f172a; }
        .rhd-subtitle { margin: 2px 0 0; font-size: 13px; color: #64748b; }
        .rhd-close {
          flex-shrink: 0;
          width: 32px; height: 32px;
          display: inline-flex; align-items: center; justify-content: center;
          border: none; border-radius: 8px;
          background: transparent; color: #64748b; cursor: pointer;
        }
        .rhd-close:hover { background: #f1f5f9; color: #0f172a; }

        .rhd-body {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          padding: 20px 24px;
          background: #f8fafc;
          display: grid;
          grid-template-columns: 320px minmax(0, 1fr);
          gap: 20px;
          align-items: start;
        }
        .rhd-side, .rhd-main { display: flex; flex-direction: column; gap: 16px; min-width: 0; }

        .rhd-card {
          background: #ffffff;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          padding: 16px;
        }
        .rhd-step {
          display: flex; align-items: center; gap: 10px;
          margin: 0 0 12px;
          font-size: 14px; font-weight: 700; color: #0f172a;
        }
        .rhd-step-num {
          flex-shrink: 0;
          width: 22px; height: 22px; border-radius: 50%;
          display: inline-flex; align-items: center; justify-content: center;
          background: #1a56db; color: #ffffff;
          font-size: 12px; font-weight: 700;
        }
        .rhd-help { margin: 0 0 12px; font-size: 13px; line-height: 1.55; color: #64748b; }
        .rhd-help--flush { margin: 0; }
        .rhd-empty { margin: 0; padding: 12px 0 4px; font-size: 13px; color: #64748b; text-align: center; }

        .rhd-input {
          width: 100%; box-sizing: border-box;
          height: 40px; padding: 0 12px;
          border: 1px solid #cbd5e1; border-radius: 8px;
          background: #ffffff; color: #0f172a;
          font-size: 14px;
        }
        .rhd-input:focus {
          outline: none;
          border-color: #1a56db;
          box-shadow: 0 0 0 3px rgba(26, 86, 219, 0.15);
        }
        .rhd-input--sm { width: 96px; height: 34px; padding: 0 10px; text-align: right; }
        .rhd-input--error { border-color: #dc2626; }
        .rhd-input--error:focus { border-color: #dc2626; box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.15); }

        .rhd-link {
          padding: 0; border: none; background: none;
          font-size: inherit; font-weight: 600; color: #1a56db; cursor: pointer;
        }
        .rhd-link:hover { text-decoration: underline; }

        .rhd-alert {
          display: flex; gap: 8px;
          margin-bottom: 12px; padding: 10px 12px;
          border: 1px solid; border-radius: 8px;
          font-size: 13px; line-height: 1.45;
        }
        .rhd-alert svg { flex-shrink: 0; margin-top: 2px; }
        .rhd-alert--warn   { background: #fffbeb; border-color: #fde68a; color: #92400e; }
        .rhd-alert--danger { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
        .rhd-alert--ok     { background: #f0fdf4; border-color: #bbf7d0; color: #166534; }
        .rhd-alert .rhd-link { color: inherit; text-decoration: underline; }

        .rhd-recip-head {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 8px;
          font-size: 12px; font-weight: 600; color: #64748b;
        }
        .rhd-recip-list {
          list-style: none; margin: 0; padding: 0;
          border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
        }
        .rhd-recip {
          display: flex; align-items: center; justify-content: space-between; gap: 8px;
          padding: 9px 12px;
          border-bottom: 1px solid #eef2f7;
          font-size: 13px;
        }
        .rhd-recip:last-child { border-bottom: none; }
        .rhd-recip-name { font-weight: 600; color: #0f172a; }
        .rhd-recip-right { display: inline-flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .rhd-recip-share { font-variant-numeric: tabular-nums; color: #475569; }
        .rhd-pill {
          padding: 2px 8px; border-radius: 999px;
          font-size: 11px; font-weight: 600; white-space: nowrap;
        }
        .rhd-pill--ok    { background: #dcfce7; color: #166534; }
        .rhd-pill--warn  { background: #fef3c7; color: #92400e; }
        .rhd-pill--muted { background: #f1f5f9; color: #64748b; }

        .rhd-badge {
          display: inline-block;
          padding: 1px 8px; border-radius: 999px;
          background: #fef3c7; color: #92400e; border: 1px solid #fde68a;
          font-size: 11px; font-weight: 700; line-height: 1.5;
          vertical-align: middle;
        }

        .rhd-med-group {
          border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
        }
        .rhd-med-group + .rhd-med-group { margin-top: 12px; }
        .rhd-med-group-head {
          display: flex; align-items: center; justify-content: space-between;
          padding: 9px 14px;
          background: #f8fafc; border-bottom: 1px solid #e2e8f0;
          font-size: 14px; font-weight: 700; color: #0f172a;
        }
        .rhd-med-group-count { font-size: 12px; font-weight: 500; color: #64748b; }

        .rhd-lot {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 11px 14px;
          border-bottom: 1px solid #eef2f7;
          background: #ffffff;
        }
        .rhd-lot:last-child { border-bottom: none; }
        .rhd-lot:hover { background: #f8fafc; }
        .rhd-lot--active { background: #eff6ff; box-shadow: inset 3px 0 0 #1a56db; }
        .rhd-lot--active:hover { background: #eff6ff; }
        /* The lot expiring soonest keeps the yellow tint, even once ticked —
           the blue bar on the left is what shows it is selected. */
        .rhd-lot--first { background: #fffbeb; }
        .rhd-lot--first:hover { background: #fef3c7; }
        .rhd-lot--first.rhd-lot--active,
        .rhd-lot--first.rhd-lot--active:hover { background: #fffbeb; }
        .rhd-lot-main {
          display: flex; align-items: center; gap: 12px;
          flex: 1 1 auto; min-width: 0; cursor: pointer;
        }
        .rhd-lot-main input[type="checkbox"] {
          flex-shrink: 0;
          width: 18px; height: 18px; margin: 0;
          accent-color: #1a56db; cursor: pointer;
        }
        .rhd-lot-title {
          display: flex; align-items: center; flex-wrap: wrap; gap: 8px;
          font-size: 14px; font-weight: 600; color: #0f172a;
        }
        .rhd-lot-meta { display: block; margin-top: 1px; font-size: 12.5px; color: #64748b; }

        .rhd-boxes { flex-shrink: 0; display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
        .rhd-boxes-hint { font-size: 11px; color: #64748b; }
        .rhd-boxes-hint--error { color: #dc2626; font-weight: 600; }

        .rhd-plan-card {
          border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden;
        }
        .rhd-plan-card + .rhd-plan-card { margin-top: 12px; }
        .rhd-plan-head {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 9px 14px;
          background: #f8fafc; border-bottom: 1px solid #e2e8f0;
          font-size: 14px; font-weight: 700; color: #0f172a;
        }
        .rhd-plan-lot { margin-left: 8px; font-size: 12px; font-weight: 500; color: #64748b; }
        .rhd-table-scroll { overflow-x: auto; }
        .rhd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .rhd-table th {
          padding: 8px 14px; text-align: left;
          border-bottom: 1px solid #e2e8f0;
          font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase;
          color: #64748b; background: #ffffff;
        }
        .rhd-table td { padding: 8px 14px; border-bottom: 1px solid #eef2f7; color: #334155; }
        .rhd-table .num { text-align: right; font-variant-numeric: tabular-nums; }
        .rhd-table tfoot td { border-bottom: none; background: #f8fafc; font-weight: 700; color: #0f172a; }
        .rhd-grand {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          margin-top: 12px; padding: 12px 14px;
          border: 1px solid #bfdbfe; border-radius: 10px;
          background: #eff6ff; color: #1e3a8a; font-size: 14px;
        }

        .rhd-footer {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 14px 24px;
          border-top: 1px solid #e2e8f0; background: #ffffff;
        }
        .rhd-footer-summary { margin: 0; font-size: 13px; color: #64748b; }
        .rhd-footer-summary strong { color: #0f172a; }
        .rhd-footer-actions { display: flex; gap: 10px; flex-shrink: 0; }
        .rhd-btn {
          height: 40px; padding: 0 20px;
          border: 1px solid transparent; border-radius: 8px;
          font-size: 14px; font-weight: 600; cursor: pointer; white-space: nowrap;
        }
        .rhd-btn--primary { background: #1a56db; color: #ffffff; }
        .rhd-btn--primary:hover { background: #1e40af; }
        .rhd-btn--primary:disabled { opacity: 0.6; cursor: not-allowed; }
        .rhd-btn--secondary { background: #ffffff; color: #334155; border-color: #cbd5e1; }
        .rhd-btn--secondary:hover { background: #f1f5f9; }

        @media (max-width: 820px) {
          .rhd-body { grid-template-columns: 1fr; padding: 16px; }
          .rhd-header, .rhd-footer { padding-left: 16px; padding-right: 16px; }
          .rhd-footer { flex-direction: column; align-items: stretch; }
          .rhd-footer-summary { text-align: center; }
          .rhd-footer-actions { justify-content: stretch; }
          .rhd-footer-actions .rhd-btn { flex: 1; }
        }
      `}</style>
    </div>
  );
}