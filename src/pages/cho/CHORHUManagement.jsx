import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, addDoc, doc, setDoc, getDocs, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useToast } from "../../context/ToastContext";
import "./CHORHUManagement.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Population Report", to: "/cho/population-report"  },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Balance Reports",   to: "/cho/balance-reports"    },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Messages",          to: "/cho/messages"           },
  { label: "Notifications",     to: "/cho/notifications"      },
];

const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";
const BARANGAYS_COLLECTION = "cho_barangays";
const DEFAULT_RHU_COUNT = 10;

function defaultRhuList() {
  return Array.from({ length: DEFAULT_RHU_COUNT }, (_, i) => ({
    id: String(i + 1),
    rhuName: `RHU ${i + 1}`,
    address: "",
    contactPerson: "",
    totalPopulation: 0,
    assignedBarangays: [],
  }));
}

export default function CHORHUManagement() {
  const { logout } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [rhus, setRhus] = useState([]);
  const [search, setSearch] = useState("");
  const [barangayCatalog, setBarangayCatalog] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingRhu, setEditingRhu] = useState(null);
  const [editAddress, setEditAddress] = useState("");
  const [editContactPerson, setEditContactPerson] = useState("");
  const [editTotalPopulation, setEditTotalPopulation] = useState("0");
  const [editBarangays, setEditBarangays] = useState([]);
  const [selectedBarangayToAdd, setSelectedBarangayToAdd] = useState("");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadRhus(); loadBarangayCatalog(); }, []);

  async function loadBarangayCatalog() {
    try {
      const snap = await getDocs(collection(db, BARANGAYS_COLLECTION));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.barangayName || "").localeCompare(b.barangayName || ""));
      setBarangayCatalog(list);
    } catch (err) { console.error(err); }
  }

  async function loadRhus() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
      if (snap.empty) {
        setRhus(defaultRhuList());
      } else {
        const saved = {};
        snap.docs.forEach(d => { saved[d.id] = d.data(); });
        const merged = defaultRhuList().map(rhu => ({
          ...rhu,
          ...saved[rhu.id],
        }));
        setRhus(merged);
      }
    } catch (err) {
      console.error(err);
      setRhus(defaultRhuList());
    }
    setLoading(false);
  }

  // Calculate sum of population from assigned barangays (checking both population and totalPopulation)
  function recalculatePopFromBarangays(assignedList, catalog = barangayCatalog) {
    return assignedList.reduce((sum, bName) => {
      const match = catalog.find(b => b.barangayName === bName);
      const pop = Number(match?.population ?? match?.totalPopulation ?? 0);
      return sum + pop;
    }, 0);
  }

  function openEditModal(rhu) {
    const assigned = rhu.assignedBarangays || [];
    setEditingRhu(rhu);
    setEditAddress(rhu.address || "");
    setEditContactPerson(rhu.contactPerson || "");
    setEditBarangays([...assigned]);
    setSelectedBarangayToAdd("");
    
    // Automatically calculate population based on assigned barangays
    const computedPop = recalculatePopFromBarangays(assigned);
    setEditTotalPopulation(String(computedPop));
    
    setShowEditModal(true);
  }

  const takenByOtherRhus = new Set(
    rhus
      .filter(r => editingRhu && r.id !== editingRhu.id)
      .flatMap(r => r.assignedBarangays || [])
  );
  const availableBarangaysToAdd = barangayCatalog.filter(b =>
    !takenByOtherRhus.has(b.barangayName) && !editBarangays.includes(b.barangayName)
  );

  function addBarangayToEdit() {
    if (!selectedBarangayToAdd) return;
    const newBarangays = [...editBarangays, selectedBarangayToAdd];
    setEditBarangays(newBarangays);
    setSelectedBarangayToAdd("");

    // Auto update population
    const newPop = recalculatePopFromBarangays(newBarangays);
    setEditTotalPopulation(String(newPop));
  }

  function removeBarangayFromEdit(name) {
    const newBarangays = editBarangays.filter(b => b !== name);
    setEditBarangays(newBarangays);

    // Auto update population
    const newPop = recalculatePopFromBarangays(newBarangays);
    setEditTotalPopulation(String(newPop));
  }

  async function saveRhu() {
    setSaving(true);
    try {
      const popVal = parseInt(editTotalPopulation, 10) || 0;

      await setDoc(doc(db, RHU_REGISTRY_COLLECTION, editingRhu.id), {
        rhuName: editingRhu.rhuName,
        address: editAddress.trim(),
        contactPerson: editContactPerson.trim(),
        totalPopulation: popVal,
        assignedBarangays: editBarangays,
        updatedAt: serverTimestamp(),
      }, { merge: true });

      const previouslyAssigned = editingRhu.assignedBarangays || [];
      const newlyAssigned = editBarangays.filter(b => !previouslyAssigned.includes(b));
      for (const barangayName of newlyAssigned) {
        await addDoc(collection(db, "notifications"), {
          type: "barangay-assignment",
          title: "New Barangay Assigned",
          message: `CHO has assigned Barangay ${barangayName} to your RHU.`,
          toRhuId: editingRhu.id,
          toRhuName: editingRhu.rhuName,
          fromType: "cho",
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setRhus(prev => prev.map(r => r.id === editingRhu.id
        ? { ...r, address: editAddress.trim(), contactPerson: editContactPerson.trim(), totalPopulation: popVal, assignedBarangays: editBarangays }
        : r
      ));
      setShowEditModal(false);
    } catch (err) { showToast("Error: " + err.message, "error"); }
    setSaving(false);
  }

  const overallTotalPopulation = rhus.reduce((sum, r) => sum + (Number(r.totalPopulation) || 0), 0);

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
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "cho-nav-item" + (isActive ? " active" : "")}>
              <span>{item.label}</span>
              {item.label === "Notifications" && Boolean(unreadCount) && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="cho-sidebar-footer">
          <NavLink to="/cho/settings" className={({ isActive }) => "cho-nav-item cho-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
          <button className="cho-nav-item cho-nav-btn cho-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="cho-main">
        <header className="cho-topbar">
          <input className="cho-search" type="text" placeholder="Search RHU or barangay..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="cho-topbar-right">
            <div className="cho-user">
              <div className="cho-user-info">
                <span className="cho-user-name">CHO Admin</span>
                <span className="cho-user-role">CHO Administrator</span>
              </div>
              <div className="cho-avatar">SS</div>
            </div>
          </div>
        </header>

        <main className="cho-content">
          <div className="cho-page-header">
            <div>
              <h1 className="cho-page-title">RHU Management</h1>
              <p className="cho-page-sub">Manage RHU details, set total population, and assign barangays.</p>
            </div>
          </div>

          <div className="cho-stats-grid cho-stats-grid--2">
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL REGISTERED RHUS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{rhus.length}</span></div>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">COMBINED TOTAL POPULATION</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{overallTotalPopulation.toLocaleString()}</span></div>
            </div>
          </div>

          {loading ? (
            <div className="cho-empty-state"><p>Loading RHU registry...</p></div>
          ) : (
            <section className="cho-section">
              <div className="cho-section-header">
                <h2 className="cho-section-title">RHU Registry</h2>
              </div>
              <div className="cho-table-wrapper">
                <table className="cho-table">
                  <thead>
                    <tr>
                      <th>RHU</th>
                      <th>ADDRESS</th>
                      <th>CONTACT PERSON</th>
                      <th>ASSIGNED BARANGAYS</th>
                      <th>TOTAL POPULATION</th>
                      <th className="text-right">ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rhus.filter(rhu => {
                      const q = search.trim().toLowerCase();
                      if (!q) return true;
                      return (rhu.rhuName || "").toLowerCase().includes(q)
                        || (rhu.address || "").toLowerCase().includes(q)
                        || (rhu.assignedBarangays || []).some(b => b.toLowerCase().includes(q));
                    }).map(rhu => (
                      <tr key={rhu.id}>
                        <td><strong>{rhu.rhuName}</strong></td>
                        <td>{rhu.address || "—"}</td>
                        <td>{rhu.contactPerson || "—"}</td>
                        <td>
                          {(rhu.assignedBarangays || []).length === 0 ? (
                            <span className="cho-product-key">No barangays assigned</span>
                          ) : (
                            <div className="cho-barangay-chip-list">
                              {rhu.assignedBarangays.map(b => (
                                <span className="cho-barangay-chip" key={b}>{b}</span>
                              ))}
                            </div>
                          )}
                        </td>
                        <td><strong>{(Number(rhu.totalPopulation) || 0).toLocaleString()}</strong></td>
                        <td className="text-right">
                          <button className="cho-btn-action cho-btn-review" onClick={() => openEditModal(rhu)}>Edit</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* Edit RHU Modal */}
      {showEditModal && editingRhu && (
        <div className="cho-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="cho-modal cho-modal--md" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">Edit {editingRhu.rhuName}</h2>
              <button className="cho-modal-close" aria-label="Close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">
              <h3 className="cho-form-section-title">RHU Details</h3>
              <div className="cho-form-row cho-form-row--3">
                <div className="cho-form-field">
                  <label className="cho-label">Address</label>
                  <input className="cho-input" type="text" placeholder="e.g., Barangay Longos, Malolos City"
                    value={editAddress} onChange={e => setEditAddress(e.target.value)} />
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Contact Person</label>
                  <input className="cho-input" type="text" placeholder="e.g., Dr. Juan Dela Cruz"
                    value={editContactPerson} onChange={e => setEditContactPerson(e.target.value)} />
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Total Population (Auto-Calculated)</label>
                  <input className="cho-input" type="number" readOnly
                    style={{ backgroundColor: "#f3f4f6", cursor: "not-allowed" }}
                    value={editTotalPopulation} />
                </div>
              </div>

              <h3 className="cho-form-section-title">Assigned Barangays</h3>
              {availableBarangaysToAdd.length === 0 && barangayCatalog.length === 0 ? (
                <p className="cho-form-hint">
                  No barangays in your catalog yet — add some in the <strong>Barangay</strong> page first.
                </p>
              ) : (
                <div className="cho-barangay-add-row">
                  <select className="cho-input" value={selectedBarangayToAdd}
                    onChange={e => setSelectedBarangayToAdd(e.target.value)}>
                    <option value="">Select a barangay to add...</option>
                    {availableBarangaysToAdd.map(b => {
                      const pop = Number(b.population ?? b.totalPopulation ?? 0);
                      return (
                        <option key={b.id} value={b.barangayName}>
                          {b.barangayName} ({pop.toLocaleString()} pop.)
                        </option>
                      );
                    })}
                  </select>
                  <button type="button" className="cho-btn-secondary" onClick={addBarangayToEdit} disabled={!selectedBarangayToAdd}>
                    Add
                  </button>
                </div>
              )}

              {editBarangays.length === 0 ? (
                <p className="cho-form-hint">No barangays assigned yet.</p>
              ) : (
                <div className="cho-barangay-chip-list cho-barangay-chip-list--editable">
                  {editBarangays.map(b => (
                    <span className="cho-barangay-chip cho-barangay-chip--removable" key={b}>
                      {b}
                      <button type="button" onClick={() => removeBarangayFromEdit(b)} aria-label={`Remove ${b}`}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="cho-btn-primary" onClick={saveRhu} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}