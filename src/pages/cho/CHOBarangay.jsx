import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, doc, setDoc, getDoc, getDocs, deleteDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./CHOBarangay.css";

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

const BARANGAYS_COLLECTION = "cho_barangays";
const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

export default function CHOBarangay() {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [search, setSearch] = useState("");
  const [barangays, setBarangays] = useState([]);
  const [assignedMap, setAssignedMap] = useState({}); // barangayName -> rhuName
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [barangayName, setBarangayName] = useState("");
  const [totalPopulation, setTotalPopulation] = useState("");
  const [address, setAddress] = useState("");
  const [midwifeName, setMidwifeName] = useState("");
  const [notes, setNotes] = useState("");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadBarangays(); loadAssignments(); }, []);

  async function loadBarangays() {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, BARANGAYS_COLLECTION));
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.barangayName || "").localeCompare(b.barangayName || ""));
      setBarangays(list);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  // Figure out which RHU (if any) each barangay is currently assigned to
  async function loadAssignments() {
    try {
      const snap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
      const map = {};
      snap.docs.forEach(d => {
        const data = d.data();
        (data.assignedBarangays || []).forEach(name => { map[name] = data.rhuName; });
      });
      setAssignedMap(map);
    } catch (err) { console.error(err); }
  }

  function openAddModal() {
    setEditingId(null);
    setBarangayName(""); 
    setTotalPopulation("");
    setAddress(""); 
    setMidwifeName(""); 
    setNotes("");
    setShowAddModal(true);
  }

  function openEditModal(b) {
    setEditingId(b.id);
    setBarangayName(b.barangayName || b.id);
    setTotalPopulation(b.totalPopulation ?? "");
    setAddress(b.address || "");
    setMidwifeName(b.midwifeName || "");
    setNotes(b.notes || "");
    setShowAddModal(true);
  }

  async function saveBarangay() {
    const trimmed = barangayName.trim();
    if (!trimmed) {
      alert("Please enter a barangay name.");
      return;
    }
    setSaving(true);
    try {
      if (!editingId) {
        const existing = await getDoc(doc(db, BARANGAYS_COLLECTION, trimmed));
        if (existing.exists()) {
          alert(`"${trimmed}" is already in the barangay list.`);
          setSaving(false);
          return;
        }
      }

      await setDoc(doc(db, BARANGAYS_COLLECTION, trimmed), {
        barangayName: trimmed,
        totalPopulation: Number(totalPopulation) || 0,
        address: address.trim(),
        midwifeName: midwifeName.trim(),
        notes: notes.trim(),
        createdBy: user?.uid ?? "",
        updatedAt: serverTimestamp(),
      }, { merge: true });

      alert(editingId ? "Barangay updated!" : "Barangay added!");
      setShowAddModal(false);
      loadBarangays();
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  async function deleteBarangay(b) {
    const assignedTo = assignedMap[b.barangayName || b.id];
    const warning = assignedTo
      ? `"${b.barangayName}" is currently assigned to ${assignedTo}. Deleting it here will NOT remove it from that RHU automatically — you'll need to remove it in RHU Management too. Delete anyway?`
      : `Delete "${b.barangayName}" from the barangay list?`;
    if (!confirm(warning)) return;
    try {
      await deleteDoc(doc(db, BARANGAYS_COLLECTION, b.id));
      setBarangays(barangays.filter(x => x.id !== b.id));
    } catch (err) { alert("Error: " + err.message); }
  }

  const filteredBarangays = barangays.filter(b =>
    (b.barangayName || "").toLowerCase().includes(search.toLowerCase())
  );
  const assignedCount = barangays.filter(b => assignedMap[b.barangayName || b.id]).length;

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
          <input className="cho-search" type="text"
            placeholder="Search barangay..."
            value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <h1 className="cho-page-title">Barangay</h1>
              <p className="cho-page-sub">Master list of barangays — these are what you assign to RHUs in RHU Management.</p>
            </div>
            <button className="cho-btn-primary" onClick={openAddModal}>+ Add New Barangay</button>
          </div>

          <div className="cho-stats-grid cho-stats-grid--2">
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL BARANGAYS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{barangays.length}</span></div>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">ASSIGNED TO AN RHU</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{assignedCount}</span></div>
            </div>
          </div>

          {loading ? (
            <div className="cho-empty-state"><p>Loading barangay list...</p></div>
          ) : filteredBarangays.length === 0 ? (
            <div className="cho-empty-state">
              <div className="cho-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6"/>
                </svg>
              </div>
              <h2 className="cho-empty-title">No Barangays Yet</h2>
              <p className="cho-empty-text">Add your barangays here first — you'll assign them to RHUs afterward in RHU Management.</p>
              <button className="cho-btn-primary" onClick={openAddModal}>+ Add Your First Barangay</button>
            </div>
          ) : (
            <section className="cho-section">
              <div className="cho-table-wrapper">
              <table className="cho-table">
                <thead>
                  <tr>
                    <th>BARANGAY</th>
                    <th>POPULATION</th>
                    <th>ADDRESS</th>
                    <th>MIDWIFE NAME</th>
                    <th>ASSIGNED TO</th>
                    <th>NOTES</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBarangays.map(b => {
                    const assignedTo = assignedMap[b.barangayName || b.id];
                    return (
                      <tr key={b.id}>
                        <td><strong>{b.barangayName}</strong></td>
                        <td>{b.totalPopulation ? Number(b.totalPopulation).toLocaleString() : "0"}</td>
                        <td>{b.address || "—"}</td>
                        <td>{b.midwifeName || "—"}</td>
                        <td>
                          {assignedTo
                            ? <span className="cho-barangay-chip">{assignedTo}</span>
                            : <span className="cho-product-key">Unassigned</span>}
                        </td>
                        <td>{b.notes || "—"}</td>
                        <td>
                          <div className="cho-action-group">
                            <button className="cho-btn-action cho-btn-review" onClick={() => openEditModal(b)}>Edit</button>
                            <button className="cho-btn-action cho-btn-danger" onClick={() => deleteBarangay(b)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </section>
          )}
        </main>
      </div>

      {/* ── Add / Edit Barangay Modal ── */}
      {showAddModal && (
        <div className="cho-modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="cho-modal" onClick={e => e.stopPropagation()}>
            <div className="cho-modal-header">
              <h2 className="cho-modal-title">{editingId ? "Edit Barangay" : "Add New Barangay"}</h2>
              <button className="cho-modal-close" aria-label="Close" onClick={() => setShowAddModal(false)}>×</button>
            </div>
            <div className="cho-modal-body">
              <div className="cho-form-field">
                <label className="cho-label">Barangay Name <span className="cho-required">*</span></label>
                <input className="cho-input" type="text" placeholder="e.g., Longos"
                  value={barangayName} onChange={e => setBarangayName(e.target.value)}
                  disabled={!!editingId} />
              </div>

              <div className="cho-form-field">
                <label className="cho-label">Total Population</label>
                <input className="cho-input" type="number" min="0" placeholder="e.g., 5000"
                  value={totalPopulation} onChange={e => setTotalPopulation(e.target.value)} />
              </div>

              <div className="cho-form-row">
                <div className="cho-form-field">
                  <label className="cho-label">Address</label>
                  <input className="cho-input" type="text" placeholder="e.g., Barangay Hall, Longos, Malolos City"
                    value={address} onChange={e => setAddress(e.target.value)} />
                </div>
                <div className="cho-form-field">
                  <label className="cho-label">Midwife Name</label>
                  <input className="cho-input" type="text" placeholder="e.g., Maria Santos"
                    value={midwifeName} onChange={e => setMidwifeName(e.target.value)} />
                </div>
              </div>

              <div className="cho-form-field">
                <label className="cho-label">Notes</label>
                <input className="cho-input" type="text" placeholder="Optional"
                  value={notes} onChange={e => setNotes(e.target.value)} />
              </div>

              {editingId && (
                <p className="cho-form-hint">Barangay name can't be changed after creation — delete and re-add if you need a different name.</p>
              )}
              <p className="cho-form-hint"><span className="cho-required">*</span> Required fields</p>
            </div>
            <div className="cho-modal-footer">
              <button className="cho-btn-secondary" onClick={() => setShowAddModal(false)}>Cancel</button>
              <button className="cho-btn-primary" onClick={saveBarangay} disabled={saving}>
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Barangay"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}