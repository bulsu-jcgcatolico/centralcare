import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import { calculateDoseWastage } from "../../utils/vaccineWastage";
import { getDoseOptionsForAntigen } from "../../utils/fhsisImmunization";
import { getCurrentMonthKey } from "../../utils/monthlyBalance";
import { getAllocationStatus } from "../../utils/bhw";
import "./MidwifeBHW.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "BHW",           to: "/midwife/bhw"         },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
];

export default function MidwifeBHW() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const unreadMessages = useUnreadMessageCount();
  const { showToast } = useToast();

  const barangayName = userData?.barangayName ?? "";

  const [activeTab, setActiveTab] = useState("allocations"); // "allocations" | "roster"
  const [loading, setLoading] = useState(false);

  const [roster, setRoster] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [inventory, setInventory] = useState([]);

  // Filters for the tables
  const [search, setSearch] = useState("");
  const [filterBhw, setFilterBhw] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { if (barangayName) loadAll(); }, [barangayName]);

  async function loadAll() {
    setLoading(true);
    try {
      const [rosterSnap, allocSnap, invSnap] = await Promise.all([
        getDocs(query(collection(db, "bhw_roster"), where("barangayName", "==", barangayName))),
        getDocs(query(collection(db, "bhw_allocations"), where("barangayName", "==", barangayName))),
        getDocs(query(collection(db, "inventory"), where("ownerType", "==", "midwife"), where("barangayName", "==", barangayName))),
      ]);
      setRoster(rosterSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllocations(allocSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error("Error loading BHW data:", err); }
    setLoading(false);
  }

  // ══════════════════════ BHW Roster ══════════════════════
  const [showAddBhwModal, setShowAddBhwModal] = useState(false);
  const [editingBhwId, setEditingBhwId] = useState(null); // null = adding a new BHW
  const [bhwName, setBhwName] = useState("");
  const [bhwPurok, setBhwPurok] = useState("");
  const [bhwContact, setBhwContact] = useState("");
  const [savingBhw, setSavingBhw] = useState(false);

  function openAddBhw() {
    setEditingBhwId(null);
    setBhwName(""); setBhwPurok(""); setBhwContact("");
    setShowAddBhwModal(true);
  }

  function openEditBhw(b) {
    setEditingBhwId(b.id);
    setBhwName(b.name || ""); setBhwPurok(b.purok || ""); setBhwContact(b.contact || "");
    setShowAddBhwModal(true);
  }

  async function saveBhw() {
    if (!bhwName.trim() || !bhwPurok.trim()) { showToast("Name and assigned purok/zone are required.", "error"); return; }
    setSavingBhw(true);
    try {
      const fields = { name: bhwName.trim(), purok: bhwPurok.trim(), contact: bhwContact.trim() };
      if (editingBhwId) {
        await updateDoc(doc(db, "bhw_roster", editingBhwId), fields);
        showToast(`${fields.name} updated.`, "success");
      } else {
        await addDoc(collection(db, "bhw_roster"), {
          barangayName, ...fields, createdAt: serverTimestamp(),
        });
        showToast(`${fields.name} added to your BHW roster.`, "success");
      }
      setShowAddBhwModal(false);
      loadAll();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSavingBhw(false);
  }

  // ══════════════════════ Allocations ══════════════════════
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocBhwId, setAllocBhwId] = useState("");
  const [allocItemId, setAllocItemId] = useState("");
  const [allocQuantity, setAllocQuantity] = useState("");
  const [savingAllocation, setSavingAllocation] = useState(false);

  const allocatableItems = inventory.filter(i => (i.remaining ?? i.quantity ?? 0) > 0);

  function openAllocateModal() {
    setAllocBhwId(""); setAllocItemId(""); setAllocQuantity("");
    setShowAllocateModal(true);
  }

  async function saveAllocation() {
    const bhw = roster.find(b => b.id === allocBhwId);
    const item = inventory.find(i => i.id === allocItemId);
    const qty = parseInt(allocQuantity);

    if (!bhw) { showToast("Select a BHW.", "error"); return; }
    if (!item) { showToast("Select an item to allocate.", "error"); return; }
    if (!qty || qty <= 0) { showToast("Enter a valid quantity.", "error"); return; }

    const available = item.remaining ?? item.quantity ?? 0;
    if (qty > available) { showToast(`Only ${available} ${item.isVaccine ? "vials" : "boxes"} of ${item.name} available.`, "error"); return; }

    setSavingAllocation(true);
    try {
      await updateDoc(doc(db, "inventory", item.id), { remaining: available - qty });

      await addDoc(collection(db, "bhw_allocations"), {
        barangayName, bhwId: bhw.id, bhwName: bhw.name, purok: bhw.purok,
        itemId: item.id, itemName: item.name, lotNumber: item.lotNumber || "",
        isVaccine: !!item.isVaccine, doseType: item.doseType || "", dosesPerVial: item.dosesPerVial || 0,
        fhsisAntigen: item.fhsisAntigen || "",
        campaignId: null,
        quantityAllocated: qty, quantityRemaining: qty,
        allocatedBy: userData?.username || "", allocatedAt: serverTimestamp(), allocatedDate: new Date().toLocaleDateString(),
      });

      showToast(`Handed ${qty} ${item.isVaccine ? "vials" : "boxes"} of ${item.name} to ${bhw.name}.`, "success");
      setShowAllocateModal(false);
      loadAll();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSavingAllocation(false);
  }

  // ══════════════════════ Usage Reporting ══════════════════════
  const [showReportModal, setShowReportModal] = useState(null);
  const [reportMode, setReportMode] = useState("aggregate");
  const [reportQuantityUsed, setReportQuantityUsed] = useState("");
  const [reportDosesGiven, setReportDosesGiven] = useState("");
  const [reportDoseLabel, setReportDoseLabel] = useState("");
  const [reportChildrenCount, setReportChildrenCount] = useState("");
  const [reportAdultsCount, setReportAdultsCount] = useState("");
  const [reportNotes, setReportNotes] = useState("");
  const [manifestEntries, setManifestEntries] = useState([]);
  const [manifestName, setManifestName] = useState("");
  const [manifestAge, setManifestAge] = useState("");
  const [manifestType, setManifestType] = useState("child");
  const [savingReport, setSavingReport] = useState(false);

  function openReportModal(allocation) {
    setShowReportModal(allocation);
    setReportMode("aggregate");
    setReportQuantityUsed(""); setReportDosesGiven(""); setReportDoseLabel("");
    setReportChildrenCount(""); setReportAdultsCount(""); setReportNotes("");
    setManifestEntries([]); setManifestName(""); setManifestAge(""); setManifestType("child");
  }

  function addManifestEntry() {
    if (!manifestName.trim()) return;
    setManifestEntries([...manifestEntries, { name: manifestName.trim(), age: manifestAge.trim(), type: manifestType }]);
    setManifestName(""); setManifestAge("");
  }

  function removeManifestEntry(idx) {
    setManifestEntries(manifestEntries.filter((_, i) => i !== idx));
  }

  async function saveUsageReport() {
    const allocation = showReportModal;
    const qty = parseInt(reportQuantityUsed);
    if (!qty || qty <= 0) { showToast(`Enter how many ${allocation.isVaccine ? "vials" : "boxes"} were used.`, "error"); return; }
    if (qty > allocation.quantityRemaining) { showToast(`${allocation.bhwName} only has ${allocation.quantityRemaining} ${allocation.isVaccine ? "vials" : "boxes"} remaining to report against.`, "error"); return; }
    if (allocation.isVaccine && !reportDoseLabel) { showToast("Select which dose this was.", "error"); return; }

    setSavingReport(true);
    try {
      let dosesGiven = 0, dosesWasted = 0;
      if (allocation.isVaccine) {
        dosesGiven = parseInt(reportDosesGiven) || 0;
        if (dosesGiven <= 0) { showToast("Enter how many doses were actually given.", "error"); setSavingReport(false); return; }
        const wastage = calculateDoseWastage({
          doseType: allocation.doseType, dosesPerVial: allocation.dosesPerVial,
          vialsUsed: qty, dosesGiven,
        });
        dosesWasted = wastage.dosesWasted;
      }

      await addDoc(collection(db, "bhw_usage_reports"), {
        barangayName, allocationId: allocation.id, bhwId: allocation.bhwId, bhwName: allocation.bhwName,
        itemName: allocation.itemName, isVaccine: allocation.isVaccine, doseType: allocation.doseType,
        dosesPerVial: allocation.dosesPerVial, fhsisAntigen: allocation.fhsisAntigen,
        doseLabel: allocation.isVaccine ? reportDoseLabel : "",
        campaignId: allocation.campaignId || null,
        reportDate: new Date().toLocaleDateString(), monthKey: getCurrentMonthKey(),
        quantityUsed: qty, dosesGiven, dosesWasted,
        childrenCount: parseInt(reportChildrenCount) || 0, adultsCount: parseInt(reportAdultsCount) || 0,
        patientManifest: manifestEntries,
        notes: reportNotes.trim(), reportedBy: userData?.username || "", createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "bhw_allocations", allocation.id), {
        quantityRemaining: allocation.quantityRemaining - qty,
      });

      showToast(`Usage reported for ${allocation.bhwName}.`, "success");
      setShowReportModal(null);
      loadAll();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSavingReport(false);
  }

  // ── Derived table data ──
  const q = search.trim().toLowerCase();
  const rosterRows = roster
    .filter(b => !q || [b.name, b.purok, b.contact].some(v => String(v ?? "").toLowerCase().includes(q)))
    .slice().sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  const allocationsWithStatus = allocations.map(a => ({ a, status: getAllocationStatus(a) }));
  const statusOptions = [...new Set(allocationsWithStatus.map(x => x.status.label).filter(Boolean))];
  const allocationRows = allocationsWithStatus
    .filter(({ a, status }) =>
      (filterBhw === "all" || a.bhwId === filterBhw) &&
      (filterStatus === "all" || status.label === filterStatus) &&
      (!q || [a.bhwName, a.itemName, a.lotNumber, a.purok].some(v => String(v ?? "").toLowerCase().includes(q))))
    .slice().sort((x, y) => String(y.a.allocatedDate || "").localeCompare(String(x.a.allocatedDate || "")));

  // Units a BHW still holds across all their allocations
  const stockOnHand = (bhwId) => {
    const mine = allocations.filter(a => a.bhwId === bhwId && (a.quantityRemaining ?? 0) > 0);
    if (mine.length === 0) return "—";
    return mine.map(a => `${a.quantityRemaining} ${a.isVaccine ? "vials" : "boxes"} ${a.itemName}`).join(", ");
  };

  return (
    <div className="midwife-layout">
      <style>{`
        .midwife-layout .midwife-content { gap: 0.875rem; }
        .midwife-layout .midwife-content > * { margin-top: 0; margin-bottom: 0; }
        .bhw-tabs { display: flex; gap: 4px; border-bottom: 1px solid #e5e7eb; }
        .bhw-tab { display: inline-flex; align-items: center; gap: 8px; padding: 10px 18px; background: none; border: none; border-bottom: 2px solid transparent; margin-bottom: -1px; font-size: 14px; font-weight: 500; color: #6b7280; cursor: pointer; }
        .bhw-tab:hover { color: #0f172a; }
        .bhw-tab.active { color: #1d4ed8; font-weight: 700; border-bottom-color: #2563eb; }
        .bhw-tab-count { background: #eff6ff; color: #1d4ed8; font-size: 11px; font-weight: 700; padding: 1px 8px; border-radius: 99px; }
        .bhw-toolbar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
        .bhw-toolbar-right { margin-left: auto; }
        .midwife-layout .bhw-search { width: 280px; flex: 0 0 auto; padding: 8px 12px; font-size: 13px; }
        .midwife-layout .bhw-select { width: 190px; flex: 0 0 auto; padding: 8px 12px; font-size: 13px; }
      `}</style>
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
              {item.label === "Messages" && Boolean(unreadMessages) && (
                <span className="nav-badge">{unreadMessages}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="midwife-sidebar-footer">
          <NavLink to="/midwife/settings" className="midwife-nav-item midwife-nav-btn">Settings</NavLink>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="midwife-main">
        <header className="midwife-topbar">
          <div className="midwife-topbar-right" style={{ marginLeft: "auto" }}>
            <div className="midwife-user">
              <div className="midwife-user-info">
                <span className="midwife-user-name">Barangay {userData?.barangayName || "Longos"}</span>
                <span className="midwife-user-role">Registered Midwife</span>
              </div>
              <div className="midwife-avatar">
                {`Barangay ${userData?.barangayName || "Longos"}`
                  .split(" ")
                  .map(n => n[0])
                  .join("")
                  .slice(0, 2)
                  .toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="midwife-content">
          <div className="midwife-page-header">
            <div>
              <h1 className="midwife-page-title">BHW</h1>
              <p className="midwife-page-sub">Track the stock you hand to Barangay Health Workers and what they have used.</p>
            </div>
          </div>

          {/* Tabs */}
          <div className="bhw-tabs">
            {[
              { key: "allocations", label: "Allocations", count: allocations.length },
              { key: "roster", label: "BHW Roster", count: roster.length },
            ].map(t => (
              <button key={t.key} type="button"
                className={"bhw-tab" + (activeTab === t.key ? " active" : "")}
                onClick={() => { setActiveTab(t.key); setSearch(""); setFilterBhw("all"); setFilterStatus("all"); }}>
                {t.label}<span className="bhw-tab-count">{t.count}</span>
              </button>
            ))}
          </div>

          {loading ? (
            <div className="midwife-empty-state"><p>Loading...</p></div>
          ) : activeTab === "roster" ? (
            <>
              <div className="bhw-toolbar">
                <input className="midwife-input bhw-search" type="text" placeholder="Search name, purok or contact"
                  value={search} onChange={e => setSearch(e.target.value)} />
                {search && <button className="midwife-btn-secondary" onClick={() => setSearch("")}>Clear</button>}
                <button className="midwife-btn-primary bhw-toolbar-right" onClick={openAddBhw}>+ Add BHW</button>
              </div>

              <section className="midwife-section">
                {roster.length === 0 ? (
                  <div className="midwife-empty-state">
                    <h2 className="midwife-empty-title">No BHWs Registered Yet</h2>
                    <p className="midwife-empty-text">Add the Barangay Health Workers who help cover different puroks/zones in your barangay.</p>
                  </div>
                ) : rosterRows.length === 0 ? (
                  <div className="midwife-empty-small" style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>No BHWs match your search.</div>
                ) : (
                  <table className="midwife-table">
                    <thead><tr><th>NAME</th><th>PUROK / ZONE</th><th>CONTACT</th><th>STOCK ON HAND</th><th>ACTIONS</th></tr></thead>
                    <tbody>
                      {rosterRows.map(b => (
                        <tr key={b.id}>
                          <td><strong>{b.name}</strong></td>
                          <td>{b.purok}</td>
                          <td>{b.contact || "—"}</td>
                          <td>{stockOnHand(b.id)}</td>
                          <td>
                            <button className="midwife-btn-secondary" onClick={() => openEditBhw(b)}>Edit</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          ) : (
            <>
              <div className="bhw-toolbar">
                <input className="midwife-input bhw-search" type="text" placeholder="Search BHW, item or lot #"
                  value={search} onChange={e => setSearch(e.target.value)} />
                <select className="midwife-input bhw-select" value={filterBhw} onChange={e => setFilterBhw(e.target.value)}>
                  <option value="all">All BHWs</option>
                  {roster.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <select className="midwife-input bhw-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                  <option value="all">All Statuses</option>
                  {statusOptions.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
                {(search || filterBhw !== "all" || filterStatus !== "all") && (
                  <button className="midwife-btn-secondary" onClick={() => { setSearch(""); setFilterBhw("all"); setFilterStatus("all"); }}>Clear filters</button>
                )}
                <button className="midwife-btn-primary bhw-toolbar-right" onClick={openAllocateModal}
                  disabled={roster.length === 0 || allocatableItems.length === 0}
                  title={roster.length === 0 ? "Add a BHW first" : allocatableItems.length === 0 ? "No stock available to allocate" : ""}>
                  + Hand Stock to BHW
                </button>
              </div>

              <section className="midwife-section">
                {allocations.length === 0 ? (
                  <div className="midwife-empty-state">
                    <h2 className="midwife-empty-title">No Allocations Yet</h2>
                    <p className="midwife-empty-text">When you hand a batch of medicine or vaccines to a BHW for their purok, record it here so you can track what they still have and what's been used.</p>
                  </div>
                ) : allocationRows.length === 0 ? (
                  <div className="midwife-empty-small" style={{ padding: "2rem", textAlign: "center", color: "#6b7280" }}>No allocations match the current filters.</div>
                ) : (
                  <table className="midwife-table">
                    <thead><tr><th>BHW</th><th>ITEM</th><th>DATE</th><th>ALLOCATED</th><th>USED</th><th>REMAINING</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                    <tbody>
                      {allocationRows.map(({ a, status }) => {
                        const unit = a.isVaccine ? "vials" : "boxes";
                        return (
                          <tr key={a.id}>
                            <td><strong>{a.bhwName}</strong><br /><span style={{ fontSize: "12px", color: "#6b7280" }}>{a.purok}</span></td>
                            <td>
                              {a.itemName}{a.isVaccine ? " 💉" : ""}
                              {a.lotNumber && <><br /><span style={{ fontSize: "12px", color: "#6b7280" }}>Lot {a.lotNumber}</span></>}
                            </td>
                            <td>{a.allocatedDate || "—"}</td>
                            <td>{a.quantityAllocated} {unit}</td>
                            <td>{(a.quantityAllocated ?? 0) - (a.quantityRemaining ?? 0)} {unit}</td>
                            <td><strong>{a.quantityRemaining}</strong> {unit}</td>
                            <td>
                              <span style={{ padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 700, background: status.bg, color: status.color }}>
                                {status.label}
                              </span>
                            </td>
                            <td>
                              <button className="midwife-btn-secondary" disabled={a.quantityRemaining <= 0}
                                onClick={() => openReportModal(a)}>
                                Report Usage
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </main>
      </div>

      {showAddBhwModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowAddBhwModal(false)}>
          <div className="midwife-modal" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">{editingBhwId ? "Edit BHW" : "Add BHW"}</h2>
              <button className="midwife-modal-close" onClick={() => setShowAddBhwModal(false)}>×</button>
            </div>
            <div className="midwife-modal-body">
              <div className="midwife-form-field">
                <label className="midwife-label">Name <span className="midwife-required">*</span></label>
                <input className="midwife-input" value={bhwName} onChange={e => setBhwName(e.target.value)} placeholder="e.g., Rosa Dela Cruz" />
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Assigned Purok / Zone <span className="midwife-required">*</span></label>
                <input className="midwife-input" value={bhwPurok} onChange={e => setBhwPurok(e.target.value)} placeholder="e.g., Purok 3" />
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Contact Number</label>
                <input className="midwife-input" value={bhwContact} onChange={e => setBhwContact(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="midwife-modal-footer">
              <button className="midwife-btn-secondary" onClick={() => setShowAddBhwModal(false)}>Cancel</button>
              <button className="midwife-btn-primary" onClick={saveBhw} disabled={savingBhw}>{savingBhw ? "Saving..." : editingBhwId ? "Save Changes" : "Add BHW"}</button>
            </div>
          </div>
        </div>
      )}

      {showAllocateModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowAllocateModal(false)}>
          <div className="midwife-modal" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">Hand Stock to BHW</h2>
              <button className="midwife-modal-close" onClick={() => setShowAllocateModal(false)}>×</button>
            </div>
            <div className="midwife-modal-body">
              <div className="midwife-form-field">
                <label className="midwife-label">BHW <span className="midwife-required">*</span></label>
                <select className="midwife-input" value={allocBhwId} onChange={e => setAllocBhwId(e.target.value)}>
                  <option value="">-- Select BHW --</option>
                  {roster.map(b => <option key={b.id} value={b.id}>{b.name} ({b.purok})</option>)}
                </select>
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Item <span className="midwife-required">*</span></label>
                <select className="midwife-input" value={allocItemId} onChange={e => setAllocItemId(e.target.value)}>
                  <option value="">-- Select Item --</option>
                  {allocatableItems.map(i => (
                    <option key={i.id} value={i.id}>
                      {i.name}{i.lotNumber ? ` (Lot ${i.lotNumber})` : ""} — {i.remaining ?? i.quantity} {i.isVaccine ? "vials" : "boxes"} available
                    </option>
                  ))}
                </select>
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Quantity <span className="midwife-required">*</span></label>
                <input className="midwife-input" type="number" min="1" value={allocQuantity} onChange={e => setAllocQuantity(e.target.value)} />
              </div>
            </div>
            <div className="midwife-modal-footer">
              <button className="midwife-btn-secondary" onClick={() => setShowAllocateModal(false)}>Cancel</button>
              <button className="midwife-btn-primary" onClick={saveAllocation} disabled={savingAllocation}>{savingAllocation ? "Saving..." : "Hand Over Stock"}</button>
            </div>
          </div>
        </div>
      )}

      {showReportModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowReportModal(null)}>
          <div className="midwife-modal midwife-modal--wide" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">Report Usage — {showReportModal.bhwName}</h2>
              <button className="midwife-modal-close" onClick={() => setShowReportModal(null)}>×</button>
            </div>
            <div className="midwife-modal-body">
              <p className="midwife-input-hint" style={{ marginBottom: "0.75rem" }}>
                {showReportModal.itemName} — {showReportModal.quantityRemaining} {showReportModal.isVaccine ? "vials" : "boxes"} still with this BHW.
              </p>

              <div className="midwife-form-row">
                <div className="midwife-form-field">
                  <label className="midwife-label">{showReportModal.isVaccine ? "Vials Used" : "Boxes Used"} <span className="midwife-required">*</span></label>
                  <input className="midwife-input" type="number" min="1" max={showReportModal.quantityRemaining}
                    value={reportQuantityUsed} onChange={e => setReportQuantityUsed(e.target.value)} />
                </div>
                {showReportModal.isVaccine && (
                  <div className="midwife-form-field">
                    <label className="midwife-label">Doses Given <span className="midwife-required">*</span></label>
                    <input className="midwife-input" type="number" min="1"
                      value={reportDosesGiven} onChange={e => setReportDosesGiven(e.target.value)} />
                  </div>
                )}
              </div>

              {showReportModal.isVaccine && (
                <div className="midwife-form-field">
                  <label className="midwife-label">Dose <span className="midwife-required">*</span></label>
                  <select className="midwife-input" value={reportDoseLabel} onChange={e => setReportDoseLabel(e.target.value)}>
                    <option value="">-- Select Dose --</option>
                    {getDoseOptionsForAntigen(showReportModal.fhsisAntigen || "other").map(opt => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                  {(!showReportModal.fhsisAntigen || showReportModal.fhsisAntigen === "other") && (
                    <p className="midwife-input-hint" style={{ marginTop: "4px" }}>
                      This vaccine isn't tagged to a standard FHSIS antigen, so it won't appear in the DOH immunization report.
                    </p>
                  )}
                </div>
              )}

              {showReportModal.isVaccine && reportQuantityUsed && reportDosesGiven && (
                (() => {
                  const w = calculateDoseWastage({
                    doseType: showReportModal.doseType, dosesPerVial: showReportModal.dosesPerVial,
                    vialsUsed: parseInt(reportQuantityUsed) || 0, dosesGiven: parseInt(reportDosesGiven) || 0,
                  });
                  return (
                    <p className="midwife-input-hint" style={{ marginBottom: "0.75rem" }}>
                      {w.totalDosesAvailable} dose(s) available from {reportQuantityUsed} vial(s) —{" "}
                      {w.dosesWasted > 0
                        ? <strong style={{ color: "#b91c1c" }}>{w.dosesWasted} dose(s) wasted ({w.wastagePercent}%)</strong>
                        : <strong style={{ color: "#166534" }}>No wastage.</strong>}
                    </p>
                  );
                })()
              )}

              <div className="midwife-form-row">
                <div className="midwife-form-field">
                  <label className="midwife-label">Children Served</label>
                  <input className="midwife-input" type="number" min="0" value={reportChildrenCount} onChange={e => setReportChildrenCount(e.target.value)} />
                </div>
                <div className="midwife-form-field">
                  <label className="midwife-label">Adults Served</label>
                  <input className="midwife-input" type="number" min="0" value={reportAdultsCount} onChange={e => setReportAdultsCount(e.target.value)} />
                </div>
              </div>

              <div className="midwife-form-field">
                <label className="midwife-label" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" checked={reportMode === "manifest"}
                    onChange={e => setReportMode(e.target.checked ? "manifest" : "aggregate")} />
                  Log individual patient names (optional — for your own reference, doesn't require prior registration)
                </label>
              </div>

              {reportMode === "manifest" && (
                <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "12px", marginBottom: "1rem" }}>
                  <div className="midwife-form-row">
                    <input className="midwife-input" placeholder="Patient name" value={manifestName} onChange={e => setManifestName(e.target.value)} />
                    <input className="midwife-input" placeholder="Age" style={{ maxWidth: "80px" }} value={manifestAge} onChange={e => setManifestAge(e.target.value)} />
                    <select className="midwife-input" style={{ maxWidth: "110px" }} value={manifestType} onChange={e => setManifestType(e.target.value)}>
                      <option value="child">Child</option>
                      <option value="adult">Adult</option>
                    </select>
                    <button type="button" className="midwife-btn-secondary" onClick={addManifestEntry}>Add</button>
                  </div>
                  {manifestEntries.length > 0 && (
                    <ul style={{ margin: "10px 0 0", paddingLeft: "1.1rem" }}>
                      {manifestEntries.map((m, idx) => (
                        <li key={idx} style={{ fontSize: "13px", marginBottom: "4px" }}>
                          {m.name}{m.age ? `, age ${m.age}` : ""} ({m.type}){" "}
                          <button type="button" onClick={() => removeManifestEntry(idx)} style={{ color: "#b91c1c", background: "none", border: "none", cursor: "pointer" }}>remove</button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div className="midwife-form-field">
                <label className="midwife-label">Notes</label>
                <input className="midwife-input" value={reportNotes} onChange={e => setReportNotes(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <div className="midwife-modal-footer">
              <button className="midwife-btn-secondary" onClick={() => setShowReportModal(null)}>Cancel</button>
              <button className="midwife-btn-primary" onClick={saveUsageReport} disabled={savingReport}>{savingReport ? "Saving..." : "Submit Report"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}