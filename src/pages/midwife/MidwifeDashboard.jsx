import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import "./MidwifeDashboard.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Notifications", to: "/midwife/notifications" },
];

export default function MidwifeDashboard() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [inventory, setInventory] = useState([]);
  const [patients, setPatients] = useState([]);
  const [dispenseLogs, setDispenseLogs] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, patSnap, dispSnap] = await Promise.all([
        getDocs(query(collection(db, "inventory"),
          where("ownerType", "==", "midwife"),
          where("barangayName", "==", userData?.barangayName ?? ""))),
        getDocs(query(collection(db, "patients"),
          where("barangayName", "==", userData?.barangayName ?? ""))),
        getDocs(query(collection(db, "dispense_logs"),
          where("barangayName", "==", userData?.barangayName ?? "")))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setPatients(patSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDispenseLogs(dispSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const lowStockItems       = inventory.filter(i => (i.remaining ?? i.quantity) <= 50);
  const availableMedicines  = inventory.filter(i => (i.remaining ?? 0) > 0);
  const totalBoxesDispensed = dispenseLogs.reduce((s, l) => s + (l.boxesDispensed || 0), 0);

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
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="midwife-sidebar-footer">
          <button className="midwife-nav-item midwife-nav-btn">Settings</button>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>Sign Out</button>
        </div>
      </aside>

      <div className="midwife-main">
        <header className="midwife-topbar">
          <input className="midwife-search" type="text"
            placeholder="Search patients, medicine, or ID..."
            value={search} onChange={e => setSearch(e.target.value)} />
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
              <div className="midwife-avatar">MS</div>
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
                Good morning, Midwife {userData?.username?.split(" ")[0] || "Maria"}.
              </p>
              <button className="midwife-hero-btn"
                onClick={() => navigate("/midwife/patients/add/child")}>
                Register New Patient
              </button>
            </div>
          </div>

          {/* Stat Cards — real data */}
          <div className="midwife-stats-grid">
            <div className="midwife-stat-card">
              <div className="midwife-stat-icon-wrap blue">
                <svg viewBox="0 0 24 24" fill="#1a56db" width="24" height="24">
                  <path d="M20 7h-3V4a2 2 0 00-2-2H9a2 2 0 00-2 2v3H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2z"/>
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
                  <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
              </div>
              <p className="midwife-stat-label">Total Patients</p>
              <p className="midwife-stat-value">{patients.length}</p>
              <span className="midwife-stat-trend up">{patients.length} registered</span>
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

          <div className="midwife-two-col">
            {/* Available medicines */}
            <section className="midwife-section">
              <div className="midwife-section-hd">
                <h2 className="midwife-section-title">Available Medicines</h2>
                <NavLink to="/midwife/inventory" className="midwife-view-all">View All</NavLink>
              </div>
              {availableMedicines.length === 0 ? (
                <div className="midwife-empty-small">
                  <p>No medicines yet. Log a shipment or wait for RHU distribution.</p>
                </div>
              ) : (
                <div className="midwife-medicine-list">
                  {availableMedicines.slice(0, 5).map(med => (
                    <div key={med.id} className="midwife-medicine-item">
                      <div className="midwife-medicine-info">
                        <p className="midwife-medicine-name">{med.name}</p>
                        <p className="midwife-medicine-sub">{med.category}</p>
                      </div>
                      <div className="midwife-medicine-stock">
                        <span className="midwife-stock-text">
                          {med.remaining} boxes
                        </span>
                        <span className={`midwife-medicine-status ${(med.remaining ?? 0) > 50 ? "good" : "expiring"}`}>
                          {med.expiry}
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
              {lowStockItems.length === 0 ? (
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
                          Only {item.remaining} boxes remaining
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