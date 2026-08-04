import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection, doc, getDoc, getDocs, updateDoc
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./RHUBarangay.css";

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

export default function RHUBarangay() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBarangay, setEditingBarangay] = useState(null);
  const [editPercent, setEditPercent] = useState("");

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadAssignedBarangays(); }, []);

  // Barangays are assigned by CHO — this page reads that assignment,
  // then lets the RHU edit each barangay's population % (a shared field
  // on the barangay itself, since CHO also references the same data).
  async function loadAssignedBarangays() {
    setLoading(true);
    try {
      const rhuId = userData?.rhuId ?? "";
      const registrySnap = await getDoc(doc(db, RHU_REGISTRY_COLLECTION, rhuId));
      const assignedNames = registrySnap.exists()
        ? (registrySnap.data().assignedBarangays || [])
        : [];

      if (assignedNames.length === 0) {
        setBarangays([]);
        setLoading(false);
        return;
      }

      const allSnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
      const all = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const assigned = all
        .filter(b => assignedNames.includes(b.barangayName))
        .sort((a, b) => (a.barangayName || "").localeCompare(b.barangayName || ""));

      setBarangays(assigned);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  function openEditModal(b) {
    setEditingBarangay(b);
    setEditPercent(b.populationPercent ? (b.populationPercent * 100).toFixed(1) : "");
    setShowEditModal(true);
  }

  async function savePercent() {
    setSaving(true);
    try {
      const fraction = parseFloat(editPercent) / 100 || 0;
      await updateDoc(doc(db, BARANGAYS_COLLECTION, editingBarangay.id), {
        populationPercent: fraction,
      });
      setBarangays(prev => prev.map(b => b.id === editingBarangay.id
        ? { ...b, populationPercent: fraction }
        : b
      ));
      setShowEditModal(false);
    } catch (err) { alert("Error: " + err.message); }
    setSaving(false);
  }

  const totalPercent = barangays.reduce((s, b) => s + (b.populationPercent || 0), 0) * 100;

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
            <p className="rhu-brand-role">RHU UNIT PANEL</p>
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
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="rhu-main">
        <header className="rhu-topbar">
          <input className="rhu-search" type="text" placeholder="Search barangay..." aria-label="Search" />
          <div className="rhu-topbar-right">
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">{userData?.username || "RHU Admin"}</span>
                <span className="rhu-user-role">{userData?.rhuName || "RHU Unit"}</span>
              </div>
              <div className="rhu-avatar">RH</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header">
            <div>
              <h1 className="rhu-page-title">Barangay</h1>
              <p className="rhu-page-sub">Barangays assigned to your RHU by CHO. You can edit each one's population % — this is what your Distribution page uses to split supplies.</p>
            </div>
          </div>

          <div className="rhu-stats-grid rhu-stats-grid--2">
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">ASSIGNED BARANGAYS</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{barangays.length}</span></div>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL POPULATION %</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{totalPercent.toFixed(1)}%</span></div>
            </div>
          </div>

          {loading ? (
            <div className="rhu-empty-state"><p>Loading barangays...</p></div>
          ) : barangays.length === 0 ? (
            <div className="rhu-empty-state">
              <div className="rhu-empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="64" height="64">
                  <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 11h.01M15 11h.01M9 15h.01M15 15h.01"/>
                </svg>
              </div>
              <h2 className="rhu-empty-title">No Barangays Assigned Yet</h2>
              <p className="rhu-empty-text">CHO hasn't assigned any barangays to your RHU yet. You'll get a notification once they do.</p>
            </div>
          ) : (
            <section className="rhu-section">
              <div className="rhu-table-wrapper">
              <table className="rhu-inv-table">
                <thead>
                  <tr>
                    <th>BARANGAY</th>
                    <th>POPULATION %</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {barangays.map(b => (
                    <tr key={b.id}>
                      <td><strong>{b.barangayName}</strong></td>
                      <td>{((b.populationPercent || 0) * 100).toFixed(1)}%</td>
                      <td>
                        <button className="rhu-btn-action rhu-btn-review" onClick={() => openEditModal(b)}>
                          Edit %
                        </button>
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

      {/* ── Edit Population % Modal ── */}
      {showEditModal && editingBarangay && (
        <div className="rhu-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="rhu-modal" onClick={e => e.stopPropagation()}>
            <div className="rhu-modal-header">
              <h2 className="rhu-modal-title">Edit {editingBarangay.barangayName}</h2>
              <button className="rhu-modal-close" aria-label="Close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="rhu-modal-body">
              <div className="rhu-form-field">
                <label className="rhu-label">Population %</label>
                <div className="rhu-pct-input-wrap">
                  <input
                    className="rhu-input rhu-pct-input"
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    placeholder="0"
                    value={editPercent}
                    onChange={e => setEditPercent(e.target.value)}
                    aria-label={`${editingBarangay.barangayName} population percentage`}
                  />
                  <span className="rhu-pct-symbol">%</span>
                </div>
              </div>
            </div>
            <div className="rhu-modal-footer">
              <button className="rhu-btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="rhu-btn-primary" onClick={savePercent} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}