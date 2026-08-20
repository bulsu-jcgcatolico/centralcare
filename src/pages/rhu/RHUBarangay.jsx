import { useState, useEffect, useMemo } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./RHUBarangay.css";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"     },
  { label: "Inventory",     to: "/rhu/inventory"     },
  { label: "Barangay",      to: "/rhu/barangay"      },
  { label: "Distribution",  to: "/rhu/distribution"  },
  { label: "Reports",       to: "/rhu/reports"       },
  { label: "Messages",      to: "/rhu/messages"      },
  { label: "Notifications", to: "/rhu/notifications" },
];

const BARANGAYS_COLLECTION = "cho_barangays";
const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

// Helper function to extract population across possible field naming conventions
const getBarangayPopulation = (b) => {
  if (!b) return 0;
  const pop = b.population ?? b.totalPopulation ?? b.headcount ?? b.pop ?? b.residents;
  return Number(pop) || 0;
};

// Helper function to extract population percentage/share
const getBarangayPercent = (b) => {
  if (!b) return 0;
  const pct = b.populationPercent ?? b.allocationShare ?? b.percent ?? 0;
  return Number(pct) || 0;
};

export default function RHUBarangay() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();

  const [barangays, setBarangays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBarangay, setEditingBarangay] = useState(null);
  const [editPopulation, setEditPopulation] = useState("");
  const [editPercent, setEditPercent] = useState("");

  function handleLogout() {
    logout();
    navigate("/");
  }

  useEffect(() => {
    if (userData) {
      loadAssignedBarangays();
    }
  }, [userData]);

  async function loadAssignedBarangays() {
    setLoading(true);
    try {
      const userRhuId   = String(userData?.rhuId   || "").trim().toLowerCase();
      const userRhuName = String(userData?.rhuName || "").trim().toLowerCase();

      let assignedKeys = [];

      // Strategy 1: Look up registry document directly by ID
      if (userData?.rhuId) {
        const regRef = doc(db, RHU_REGISTRY_COLLECTION, String(userData.rhuId));
        const regSnap = await getDoc(regRef);
        if (regSnap.exists()) {
          assignedKeys = regSnap.data().assignedBarangays || [];
        }
      }

      // Strategy 2: Scan registry collection if array is empty
      if (assignedKeys.length === 0) {
        const regQuery = query(collection(db, RHU_REGISTRY_COLLECTION));
        const regSnap = await getDocs(regQuery);
        regSnap.docs.forEach(d => {
          const data = d.data();
          const dRhuId   = String(data.rhuId   || "").trim().toLowerCase();
          const dRhuName = String(data.rhuName || d.id || "").trim().toLowerCase();
          if ((userRhuId && dRhuId === userRhuId) || (userRhuName && dRhuName === userRhuName)) {
            if (Array.isArray(data.assignedBarangays)) {
              assignedKeys = [...assignedKeys, ...data.assignedBarangays];
            }
          }
        });
      }

      // Fetch all barangays to match
      const allSnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
      const allBarangays = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      const normalizedKeys = assignedKeys.map(k => String(k).trim().toLowerCase());

      const assigned = allBarangays.filter(b => {
        const bName = String(b.barangayName || b.name || "").trim().toLowerCase();
        const bId   = String(b.id).trim().toLowerCase();
        const bRhuId = String(b.rhuId || b.assignedRhuId || "").trim().toLowerCase();
        const bRhuName = String(b.assignedRhu || b.rhuName || "").trim().toLowerCase();

        const inRegistry = normalizedKeys.includes(bName) || normalizedKeys.includes(bId);
        const directMatch = (userRhuId && bRhuId === userRhuId) || (userRhuName && bRhuName === userRhuName);

        return inRegistry || directMatch;
      }).sort((a, b) => (a.barangayName || a.name || "").localeCompare(b.barangayName || b.name || ""));

      setBarangays(assigned);
    } catch (err) {
      console.error("Error loading assigned barangays:", err);
    }
    setLoading(false);
  }

  function openEditModal(b) {
    setEditingBarangay(b);
    setEditPopulation(getBarangayPopulation(b));
    const rawPct = getBarangayPercent(b);
    setEditPercent(rawPct > 1 ? rawPct.toFixed(1) : (rawPct * 100).toFixed(1));
    setShowEditModal(true);
  }

  async function saveBarangayDetails() {
    if (!editingBarangay) return;
    setSaving(true);
    try {
      const rawPop = parseInt(editPopulation, 10) || 0;
      const fraction = parseFloat(editPercent) / 100 || 0;

      await updateDoc(doc(db, BARANGAYS_COLLECTION, editingBarangay.id), {
        population: rawPop,
        populationPercent: fraction,
      });

      setBarangays(prev => prev.map(b => b.id === editingBarangay.id
        ? { ...b, population: rawPop, populationPercent: fraction }
        : b
      ));
      setShowEditModal(false);
    } catch (err) {
      alert("Error updating barangay: " + err.message);
    }
    setSaving(false);
  }

  const filteredBarangays = useMemo(() => {
    if (!searchQuery.trim()) return barangays;
    const q = searchQuery.toLowerCase();
    return barangays.filter(b => (b.barangayName || b.name || "").toLowerCase().includes(q));
  }, [barangays, searchQuery]);

  const totalRawPopulation = useMemo(() => {
    return barangays.reduce((sum, b) => sum + getBarangayPopulation(b), 0);
  }, [barangays]);

  const totalPercent = useMemo(() => {
    return barangays.reduce((sum, b) => {
      const pct = getBarangayPercent(b);
      return sum + (pct > 1 ? pct : pct * 100);
    }, 0);
  }, [barangays]);

  return (
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

      {/* ── Main Area ── */}
      <div className="rhu-main">
        <header className="rhu-topbar">
          <input
            className="rhu-search"
            type="text"
            placeholder="Search assigned barangays..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="Search barangays"
          />
          <div className="rhu-topbar-right">
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">{userData?.username || "RHU Admin"}</span>
              </div>
              <div className="rhu-avatar">RH</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="bgy-header-row">
            <div>
              <h1 className="rhu-page-title">Assigned Barangays</h1>
              <p className="rhu-page-sub">
                Barangays assigned to <strong>{userData?.rhuName || "your RHU"}</strong> from CHO.
              </p>
            </div>
            <button className="bgy-btn-refresh" onClick={loadAssignedBarangays}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
              Refresh
            </button>
          </div>

          {/* Metric Overview Cards */}
          <div className="bgy-metrics-grid">
            <div className="bgy-card">
              <div className="bgy-icon bgy-icon--blue">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              </div>
              <div>
                <span className="bgy-card-title">ASSIGNED BARANGAYS</span>
                <p className="bgy-card-val">{barangays.length}</p>
              </div>
            </div>

            <div className="bgy-card">
              <div className="bgy-icon bgy-icon--green">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
              </div>
              <div>
                <span className="bgy-card-title">TOTAL HEADCOUNT</span>
                <p className="bgy-card-val">{totalRawPopulation.toLocaleString()}</p>
              </div>
            </div>

            <div className="bgy-card">
              <div className="bgy-icon bgy-icon--purple">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
                </svg>
              </div>
              <div>
                <span className="bgy-card-title">ALLOCATED SHARE</span>
                <p className="bgy-card-val">{totalPercent.toFixed(1)}%</p>
              </div>
            </div>
          </div>

          {/* Table Area */}
          {loading ? (
            <div className="bgy-loading-card">
              <div className="bgy-spinner"></div>
              <p>Fetching assigned barangay records...</p>
            </div>
          ) : filteredBarangays.length === 0 ? (
            <div className="bgy-empty-card">
              <p className="bgy-empty-title">
                {searchQuery ? "No matching barangays" : "No Assigned Barangays Found"}
              </p>
              <p className="bgy-empty-sub">
                {searchQuery
                  ? `No barangay matching "${searchQuery}" was found.`
                  : "CHO has not configured assigned barangays for this unit yet."}
              </p>
            </div>
          ) : (
            <div className="bgy-table-card">
              <table className="bgy-table">
                <thead>
                  <tr>
                    <th>BARANGAY NAME</th>
                    <th>POPULATION</th>
                    <th>ALLOCATION SHARE</th>
                    <th>DISTRIBUTION % VISUAL</th>
                    <th style={{ textAlign: "right" }}>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBarangays.map(b => {
                    const pop = getBarangayPopulation(b);
                    const rawPct = getBarangayPercent(b);
                    const pct = rawPct > 1 ? rawPct : rawPct * 100;

                    return (
                      <tr key={b.id}>
                        <td>
                          <div className="bgy-name-cell">
                            <strong>{b.barangayName || b.name}</strong>
                          </div>
                        </td>
                        <td>
                          <span className="bgy-pop-badge">
                            {pop.toLocaleString()}
                          </span>
                        </td>
                        <td>
                          <span className="bgy-share-badge">{pct.toFixed(1)}%</span>
                        </td>
                        <td className="bgy-bar-cell">
                          <div className="bgy-bar-track">
                            <div
                              className="bgy-bar-fill"
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            className="bgy-btn-edit"
                            onClick={() => openEditModal(b)}
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </div>

      {/* Edit Modal */}
      {showEditModal && editingBarangay && (
        <div className="bgy-modal-overlay" onClick={() => setShowEditModal(false)}>
          <div className="bgy-modal" onClick={e => e.stopPropagation()}>
            <div className="bgy-modal-header">
              <h3>Edit {editingBarangay.barangayName || editingBarangay.name}</h3>
              <button className="bgy-modal-close" onClick={() => setShowEditModal(false)}>×</button>
            </div>
            <div className="bgy-modal-body">
              <div className="bgy-field">
                <label>Barangay Population Headcount</label>
                <input
                  type="number"
                  min="0"
                  value={editPopulation}
                  onChange={e => setEditPopulation(e.target.value)}
                  placeholder="e.g. 4500"
                />
              </div>
              <div className="bgy-field">
                <label>Allocation Share %</label>
                <div className="bgy-input-group">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={editPercent}
                    onChange={e => setEditPercent(e.target.value)}
                    placeholder="0.0"
                  />
                  <span>%</span>
                </div>
              </div>
            </div>
            <div className="bgy-modal-footer">
              <button className="bgy-btn-cancel" onClick={() => setShowEditModal(false)}>Cancel</button>
              <button className="bgy-btn-save" onClick={saveBarangayDetails} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}