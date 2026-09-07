import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import {
  collection, addDoc, updateDoc, doc, getDocs, query, where, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { calculateDoseWastage } from "../../utils/vaccineWastage";
import { getDoseOptionsForAntigen } from "../../utils/fhsisImmunization";
import { getCurrentMonthKey } from "../../utils/monthlyBalance";
import { getAllocationStatus, buildCampaignSummary, isCampaignActive } from "../../utils/bhw";
import "./MidwifeBHW.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "BHW & Campaigns", to: "/midwife/bhw"         },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
];

export default function MidwifeBHW() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const { showToast } = useToast();

  const barangayName = userData?.barangayName ?? "";

  const [activeTab, setActiveTab] = useState("allocations"); // "allocations" | "roster" | "campaigns"
  const [loading, setLoading] = useState(false);

  const [roster, setRoster] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [usageReports, setUsageReports] = useState([]);
  const [immunizationLogs, setImmunizationLogs] = useState([]);
  const [dispenseLogs, setDispenseLogs] = useState([]);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { if (barangayName) loadAll(); }, [barangayName]);

  async function loadAll() {
    setLoading(true);
    try {
      const [rosterSnap, campSnap, allocSnap, invSnap, usageSnap, immunSnap, dispSnap] = await Promise.all([
        getDocs(query(collection(db, "bhw_roster"), where("barangayName", "==", barangayName))),
        getDocs(query(collection(db, "bhw_campaigns"), where("barangayName", "==", barangayName))),
        getDocs(query(collection(db, "bhw_allocations"), where("barangayName", "==", barangayName))),
        getDocs(query(collection(db, "inventory"), where("ownerType", "==", "midwife"), where("barangayName", "==", barangayName))),
        getDocs(query(collection(db, "bhw_usage_reports"), where("barangayName", "==", barangayName))),
        getDocs(query(collection(db, "immunization_logs"), where("barangayName", "==", barangayName))),
        getDocs(query(collection(db, "dispense_logs"), where("barangayName", "==", barangayName))),
      ]);
      setRoster(rosterSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setCampaigns(campSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setAllocations(allocSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setUsageReports(usageSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setImmunizationLogs(immunSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDispenseLogs(dispSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error("Error loading BHW data:", err); }
    setLoading(false);
  }

  // ══════════════════════ BHW Roster ══════════════════════
  const [showAddBhwModal, setShowAddBhwModal] = useState(false);
  const [bhwName, setBhwName] = useState("");
  const [bhwPurok, setBhwPurok] = useState("");
  const [bhwContact, setBhwContact] = useState("");
  const [savingBhw, setSavingBhw] = useState(false);

  async function saveBhw() {
    if (!bhwName.trim() || !bhwPurok.trim()) { showToast("Name and assigned purok/zone are required.", "error"); return; }
    setSavingBhw(true);
    try {
      await addDoc(collection(db, "bhw_roster"), {
        barangayName, name: bhwName.trim(), purok: bhwPurok.trim(), contact: bhwContact.trim(),
        active: true, createdAt: serverTimestamp(),
      });
      showToast(`${bhwName.trim()} added to your BHW roster.`, "success");
      setBhwName(""); setBhwPurok(""); setBhwContact(""); setShowAddBhwModal(false);
      loadAll();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSavingBhw(false);
  }

  async function toggleBhwActive(bhw) {
    try {
      await updateDoc(doc(db, "bhw_roster", bhw.id), { active: !bhw.active });
      loadAll();
    } catch (err) { showToast("Error: " + err.message, "error"); }
  }

  // ══════════════════════ Campaigns ══════════════════════
  const [showAddCampaignModal, setShowAddCampaignModal] = useState(false);
  const [campaignName, setCampaignName] = useState("");
  const [campaignDescription, setCampaignDescription] = useState("");
  const [campaignStart, setCampaignStart] = useState("");
  const [campaignEnd, setCampaignEnd] = useState("");
  const [campaignTarget, setCampaignTarget] = useState("");
  const [savingCampaign, setSavingCampaign] = useState(false);

  async function saveCampaign() {
    if (!campaignName.trim() || !campaignStart) { showToast("Campaign name and start date are required.", "error"); return; }
    setSavingCampaign(true);
    try {
      await addDoc(collection(db, "bhw_campaigns"), {
        barangayName, name: campaignName.trim(), description: campaignDescription.trim(),
        startDate: campaignStart, endDate: campaignEnd || null,
        targetPopulation: campaignTarget ? parseInt(campaignTarget) : 0,
        createdBy: userData?.username || "", createdAt: serverTimestamp(),
      });
      showToast(`Campaign "${campaignName.trim()}" created.`, "success");
      setCampaignName(""); setCampaignDescription(""); setCampaignStart(""); setCampaignEnd(""); setCampaignTarget("");
      setShowAddCampaignModal(false);
      loadAll();
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSavingCampaign(false);
  }

  // ══════════════════════ Allocations ══════════════════════
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocBhwId, setAllocBhwId] = useState("");
  const [allocItemId, setAllocItemId] = useState("");
  const [allocQuantity, setAllocQuantity] = useState("");
  const [allocCampaignId, setAllocCampaignId] = useState("");
  const [savingAllocation, setSavingAllocation] = useState(false);

  const activeRoster = roster.filter(b => b.active);
  const allocatableItems = inventory.filter(i => (i.remaining ?? i.quantity ?? 0) > 0);

  function openAllocateModal() {
    setAllocBhwId(""); setAllocItemId(""); setAllocQuantity(""); setAllocCampaignId("");
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
        campaignId: allocCampaignId || null,
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

  return (
    <div className="midwife-layout">
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
                <span className="midwife-user-name">{userData?.username || "Midwife"}</span>
                <span className="midwife-user-role">Registered Midwife</span>
              </div>
              <div className="midwife-avatar">MS</div>
            </div>
          </div>
        </header>

        <main className="midwife-content">
          <div className="midwife-page-header">
            <div>
              <h1 className="midwife-page-title">BHW & Campaigns</h1>
              <p className="midwife-page-sub">Track stock handed to Barangay Health Workers and MR-SIA-style campaign activity.</p>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem" }}>
            {[
              { key: "allocations", label: "Allocations" },
              { key: "roster", label: "BHW Roster" },
              { key: "campaigns", label: "Campaigns" },
            ].map(t => (
              <button key={t.key} type="button"
                className={activeTab === t.key ? "midwife-btn-primary" : "midwife-btn-secondary"}
                onClick={() => setActiveTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="midwife-empty-state"><p>Loading...</p></div>
          ) : activeTab === "roster" ? (
            <section className="midwife-section">
              <div className="midwife-section-hd">
                <h2 className="midwife-section-title">Your BHWs</h2>
                <button className="midwife-btn-primary" onClick={() => setShowAddBhwModal(true)}>+ Add BHW</button>
              </div>
              {roster.length === 0 ? (
                <div className="midwife-empty-state">
                  <h2 className="midwife-empty-title">No BHWs Registered Yet</h2>
                  <p className="midwife-empty-text">Add the Barangay Health Workers who help cover different puroks/zones in your barangay.</p>
                </div>
              ) : (
                <table className="midwife-table">
                  <thead><tr><th>NAME</th><th>PUROK / ZONE</th><th>CONTACT</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                  <tbody>
                    {roster.map(b => (
                      <tr key={b.id}>
                        <td><strong>{b.name}</strong></td>
                        <td>{b.purok}</td>
                        <td>{b.contact || "—"}</td>
                        <td>
                          <span style={{ padding: "3px 10px", borderRadius: "99px", fontSize: "11px", fontWeight: 700,
                            background: b.active ? "#d1fae5" : "#f3f4f6", color: b.active ? "#065f46" : "#6b7280" }}>
                            {b.active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>
                          <button className="midwife-btn-secondary" onClick={() => toggleBhwActive(b)}>
                            {b.active ? "Deactivate" : "Reactivate"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          ) : activeTab === "campaigns" ? (
            <section className="midwife-section">
              <div className="midwife-section-hd">
                <h2 className="midwife-section-title">Campaigns (e.g. MR-SIA)</h2>
                <button className="midwife-btn-primary" onClick={() => setShowAddCampaignModal(true)}>+ New Campaign</button>
              </div>
              {campaigns.length === 0 ? (
                <div className="midwife-empty-state">
                  <h2 className="midwife-empty-title">No Campaigns Yet</h2>
                  <p className="midwife-empty-text">Create one for events like MR-SIA (Measles-Rubella Supplemental Immunization Activity) so stock and coverage during the campaign are tracked separately from routine monthly activity.</p>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  {campaigns.map(c => {
                    const summary = buildCampaignSummary(c, allocations, usageReports, immunizationLogs, dispenseLogs);
                    const active = isCampaignActive(c);
                    return (
                      <div key={c.id} style={{ border: "1px solid #e5e7eb", borderRadius: "10px", padding: "16px 20px", background: "#fff" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "8px" }}>
                          <div>
                            <p style={{ margin: 0, fontWeight: 700, fontSize: "1.05rem", color: "#0f172a" }}>
                              {c.name}
                              <span style={{
                                marginLeft: "10px", fontSize: "11px", fontWeight: 700, padding: "2px 8px", borderRadius: "99px",
                                background: active ? "#d1fae5" : "#f3f4f6", color: active ? "#065f46" : "#6b7280",
                              }}>{active ? "Active" : "Ended"}</span>
                            </p>
                            <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#6b7280" }}>
                              {c.startDate}{c.endDate ? ` – ${c.endDate}` : ""} {c.description ? `· ${c.description}` : ""}
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            {summary.coveragePercent !== null && (
                              <span style={{
                                fontSize: "12px", fontWeight: 700, padding: "4px 10px", borderRadius: "99px",
                                background: summary.coveragePercent >= 95 ? "#d1fae5" : summary.coveragePercent >= 80 ? "#fef3c7" : "#fee2e2",
                                color: summary.coveragePercent >= 95 ? "#065f46" : summary.coveragePercent >= 80 ? "#92400e" : "#991b1b",
                              }}>{summary.coveragePercent}% of target</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "10px", marginTop: "12px" }}>
                          <div><p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>BHWs INVOLVED</p><p style={{ margin: "2px 0 0", fontWeight: 700 }}>{summary.bhwCount}</p></div>
                          <div><p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>ALLOCATED</p><p style={{ margin: "2px 0 0", fontWeight: 700 }}>{summary.totalAllocated}</p></div>
                          <div><p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>USED</p><p style={{ margin: "2px 0 0", fontWeight: 700 }}>{summary.totalUsed}</p></div>
                          <div><p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>CHILDREN REACHED</p><p style={{ margin: "2px 0 0", fontWeight: 700 }}>{summary.childrenReached}</p></div>
                          <div><p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>DOSES WASTED</p><p style={{ margin: "2px 0 0", fontWeight: 700, color: summary.dosesWasted > 0 ? "#b91c1c" : undefined }}>{summary.dosesWasted}</p></div>
                          {summary.target > 0 && (
                            <div><p style={{ margin: 0, fontSize: "11px", color: "#9ca3af" }}>TARGET POPULATION</p><p style={{ margin: "2px 0 0", fontWeight: 700 }}>{summary.target}</p></div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <section className="midwife-section">
              <div className="midwife-section-hd">
                <h2 className="midwife-section-title">Stock Handed to BHWs</h2>
                <button className="midwife-btn-primary" onClick={openAllocateModal}
                  disabled={activeRoster.length === 0 || allocatableItems.length === 0}
                  title={activeRoster.length === 0 ? "Add a BHW first" : allocatableItems.length === 0 ? "No stock available to allocate" : ""}>
                  + Hand Stock to BHW
                </button>
              </div>
              {allocations.length === 0 ? (
                <div className="midwife-empty-state">
                  <h2 className="midwife-empty-title">No Allocations Yet</h2>
                  <p className="midwife-empty-text">When you hand a batch of medicine or vaccines to a BHW for their purok, record it here so you can track what they still have and what's been used.</p>
                </div>
              ) : (
                <table className="midwife-table">
                  <thead><tr><th>BHW</th><th>ITEM</th><th>ALLOCATED</th><th>REMAINING</th><th>CAMPAIGN</th><th>STATUS</th><th>ACTIONS</th></tr></thead>
                  <tbody>
                    {allocations.map(a => {
                      const status = getAllocationStatus(a);
                      const campaign = campaigns.find(c => c.id === a.campaignId);
                      return (
                        <tr key={a.id}>
                          <td><strong>{a.bhwName}</strong><br /><span style={{ fontSize: "12px", color: "#6b7280" }}>{a.purok}</span></td>
                          <td>{a.itemName}{a.isVaccine ? " 💉" : ""}</td>
                          <td>{a.quantityAllocated} {a.isVaccine ? "vials" : "boxes"}</td>
                          <td>{a.quantityRemaining} {a.isVaccine ? "vials" : "boxes"}</td>
                          <td>{campaign ? campaign.name : "—"}</td>
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
          )}
        </main>
      </div>

      {showAddBhwModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowAddBhwModal(false)}>
          <div className="midwife-modal" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">Add BHW</h2>
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
              <button className="midwife-btn-primary" onClick={saveBhw} disabled={savingBhw}>{savingBhw ? "Saving..." : "Add BHW"}</button>
            </div>
          </div>
        </div>
      )}

      {showAddCampaignModal && (
        <div className="midwife-modal-overlay" onClick={() => setShowAddCampaignModal(false)}>
          <div className="midwife-modal" onClick={e => e.stopPropagation()}>
            <div className="midwife-modal-header">
              <h2 className="midwife-modal-title">New Campaign</h2>
              <button className="midwife-modal-close" onClick={() => setShowAddCampaignModal(false)}>×</button>
            </div>
            <div className="midwife-modal-body">
              <div className="midwife-form-field">
                <label className="midwife-label">Campaign Name <span className="midwife-required">*</span></label>
                <input className="midwife-input" value={campaignName} onChange={e => setCampaignName(e.target.value)} placeholder="e.g., MR-SIA 2026 Phase 1" />
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Description</label>
                <input className="midwife-input" value={campaignDescription} onChange={e => setCampaignDescription(e.target.value)} placeholder="e.g., Measles-Rubella catch-up, ages 6-59 months" />
              </div>
              <div className="midwife-form-row">
                <div className="midwife-form-field">
                  <label className="midwife-label">Start Date <span className="midwife-required">*</span></label>
                  <input className="midwife-input" type="date" value={campaignStart} onChange={e => setCampaignStart(e.target.value)} />
                </div>
                <div className="midwife-form-field">
                  <label className="midwife-label">End Date</label>
                  <input className="midwife-input" type="date" value={campaignEnd} onChange={e => setCampaignEnd(e.target.value)} />
                </div>
              </div>
              <div className="midwife-form-field">
                <label className="midwife-label">Target Population (optional)</label>
                <input className="midwife-input" type="number" min="0" value={campaignTarget} onChange={e => setCampaignTarget(e.target.value)} placeholder="e.g., estimated eligible children in barangay" />
                <p className="midwife-input-hint">If you have a local estimate (e.g. from RHU/CHO), coverage % will be calculated against it.</p>
              </div>
            </div>
            <div className="midwife-modal-footer">
              <button className="midwife-btn-secondary" onClick={() => setShowAddCampaignModal(false)}>Cancel</button>
              <button className="midwife-btn-primary" onClick={saveCampaign} disabled={savingCampaign}>{savingCampaign ? "Saving..." : "Create Campaign"}</button>
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
                  {activeRoster.map(b => <option key={b.id} value={b.id}>{b.name} ({b.purok})</option>)}
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
              <div className="midwife-form-field">
                <label className="midwife-label">Campaign (optional)</label>
                <select className="midwife-input" value={allocCampaignId} onChange={e => setAllocCampaignId(e.target.value)}>
                  <option value="">-- Routine (not tied to a campaign) --</option>
                  {campaigns.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
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
