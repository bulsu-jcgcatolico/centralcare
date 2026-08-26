import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./MidwifeDashboard.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
];

export default function MidwifeDashboard() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  
  const [search, setSearch] = useState("");
  const [inventory, setInventory] = useState([]);
  const [patients, setPatients] = useState([]);
  const [dispenseLogs, setDispenseLogs] = useState([]);
  const [barangayPopulation, setBarangayPopulation] = useState(0);
  const [loading, setLoading] = useState(false);

  function handleLogout() {
    logout();
    navigate("/");
  }

  useEffect(() => {
    if (userData?.barangayName) {
      loadData();
    }
  }, [userData?.barangayName]);

  async function loadData() {
    setLoading(true);
    try {
      const currentBarangay = userData?.barangayName ?? "";

      const [invSnap, patSnap, dispSnap, barangaySnap] = await Promise.all([
        getDocs(query(
          collection(db, "inventory"),
          where("ownerType", "==", "midwife"),
          where("barangayName", "==", currentBarangay)
        )),
        getDocs(query(
          collection(db, "patients"),
          where("barangayName", "==", currentBarangay)
        )),
        getDocs(query(
          collection(db, "dispense_logs"),
          where("barangayName", "==", currentBarangay)
        )),
        currentBarangay
          ? getDoc(doc(db, "cho_barangays", currentBarangay))
          : Promise.resolve(null)
      ]);

      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPatients(patSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDispenseLogs(dispSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      if (barangaySnap && barangaySnap.exists()) {
        const bData = barangaySnap.data();
        if (bData.totalPopulation !== undefined) {
          setBarangayPopulation(bData.totalPopulation);
        }
      }
    } catch (err) {
      console.error("Error loading dashboard data:", err);
    }
    setLoading(false);
  }

  const lowStockItems = inventory.filter(i => (i.remaining ?? i.quantity ?? 0) <= 50);
  const availableMedicines = inventory.filter(i => (i.remaining ?? i.quantity ?? 0) > 0);
  const totalBoxesDispensed = dispenseLogs.reduce((s, l) => s + (l.boxesDispensed || 0), 0);

  const filteredMedicines = availableMedicines.filter(med =>
    med.name?.toLowerCase().includes(search.toLowerCase()) ||
    med.category?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="midwife-layout">
      {/* Sidebar */}
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
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => "midwife-nav-item" + (isActive ? " active" : "")}
            >
              <span>{item.label}</span>
              {item.label === "Notifications" && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="midwife-sidebar-footer">
          <NavLink to="/midwife/settings" className={({ isActive }) => "midwife-nav-item midwife-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Section */}
      <div className="midwife-main">
        <header className="midwife-topbar">
          <input
            className="midwife-search"
            type="text"
            placeholder="Search patients, medicine, or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="midwife-topbar-right">
            <button className="midwife-notif-btn">
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
            </button>
            <div className="midwife-user">
              <div className="midwife-user-info">
                <span className="midwife-user-name">{userData?.username || "Maria Santos"}</span>
                <span className="midwife-user-role">Registered Midwife</span>
              </div>
              <div className="midwife-avatar">
                {userData?.username ? userData.username.split(" ").map(n => n[0]).join("") : "MS"}
              </div>
            </div>
          </div>
        </header>

        <main className="midwife-content">
          <div className="midwife-hero">
            <div className="midwife-hero-content">
              <h1 className="midwife-hero-title">
                Barangay {userData?.barangayName || "Longos"} Health Center
              </h1>
              <p className="midwife-hero-sub">
                Good day, Midwife {userData?.username?.split(" ")[0] || "Maria"}. Here is your health station summary.
              </p>
              <button
                className="midwife-hero-btn"
                onClick={() => navigate("/midwife/patients/add/child")}
              >
                Register New Patient
              </button>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="midwife-stats-grid">
            <div className="midwife-stat-card">
              <div className="midwife-stat-icon-wrap blue">
                <svg viewBox="0 0 24 24" fill="#1a56db" width="24" height="24">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 022 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
                </svg>
              </div>
              <p className="midwife-stat-label">Available Medicines</p>
              <p className="midwife-stat-value">{availableMedicines.length}</p>
              <span className="midwife-stat-trend up">Total inventory items</span>
            </div>

            <div className="midwife-stat-card">
              <div className="midwife-stat-icon-wrap orange">
                <svg viewBox="0 0 24 24" fill="#d97706" width="24" height="24">
                  <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                </svg>
              </div>
              <p className="midwife-stat-label">Low Stock Items</p>
              <p className="midwife-stat-value">{lowStockItems.length}</p>
              <span className="midwife-stat-trend warning">
                {lowStockItems.length > 0 ? "Request from RHU" : "All stocked"}
              </span>
            </div>

            <div className="midwife-stat-card">
              <div className="midwife-stat-icon-wrap purple">
                <svg viewBox="0 0 24 24" fill="#7c3aed" width="24" height="24">
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
              </div>
              <p className="midwife-stat-label">Total Registered Patients</p>
              <p className="midwife-stat-value">{patients.length}</p>
              <span className="midwife-stat-trend up">
                Pop. {barangayPopulation.toLocaleString()}
              </span>
            </div>

            <div className="midwife-stat-card">
              <div className="midwife-stat-icon-wrap green">
                <svg viewBox="0 0 24 24" fill="#16a34a" width="24" height="24">
                  <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
                </svg>
              </div>
              <p className="midwife-stat-label">Boxes Dispensed</p>
              <p className="midwife-stat-value">{totalBoxesDispensed}</p>
              <span className="midwife-stat-trend up">All time</span>
            </div>
          </div>

          {/* Two Column Layout */}
          <div className="midwife-two-col">
            {/* Available medicines */}
            <section className="midwife-section">
              <div className="midwife-section-hd">
                <h2 className="midwife-section-title">Available Medicines</h2>
                <NavLink to="/midwife/inventory" className="midwife-view-all">View All</NavLink>
              </div>
              {loading ? (
                <div className="midwife-empty-small"><p>Loading inventory...</p></div>
              ) : filteredMedicines.length === 0 ? (
                <div className="midwife-empty-small">
                  <p>{search ? "No matching medicines found." : "No medicines yet. Log a shipment or wait for RHU distribution."}</p>
                </div>
              ) : (
                <div className="midwife-medicine-list">
                  {filteredMedicines.slice(0, 5).map(med => (
                    <div key={med.id} className="midwife-medicine-item">
                      <div className="midwife-medicine-info">
                        <p className="midwife-medicine-name">{med.name}</p>
                        <p className="midwife-medicine-sub">{med.category}</p>
                      </div>
                      <div className="midwife-medicine-stock">
                        <span className="midwife-stock-text">
                          {med.remaining ?? med.quantity ?? 0} boxes
                        </span>
                        <span className={`midwife-medicine-status ${(med.remaining ?? med.quantity ?? 0) > 50 ? "good" : "expiring"}`}>
                          {med.expiry || "Active"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Low stock alerts */}
            <section className="midwife-section">
              <div className="midwife-section-hd">
                <h2 className="midwife-section-title">Low Stock Alerts</h2>
                <span className="midwife-alert-count">{lowStockItems.length} ITEMS</span>
              </div>
              {loading ? (
                <div className="midwife-empty-small"><p>Loading alerts...</p></div>
              ) : lowStockItems.length === 0 ? (
                <div className="midwife-empty-small"><p>No low stock alerts.</p></div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {lowStockItems.map(item => (
                    <div key={item.id} className="midwife-alert-card">
                      <div className="midwife-alert-icon">
                        <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                          <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                        </svg>
                      </div>
                      <div className="midwife-alert-content">
                        <p className="midwife-alert-title">{item.name}</p>
                        <p className="midwife-alert-msg">
                          Only {item.remaining ?? item.quantity ?? 0} boxes remaining
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}