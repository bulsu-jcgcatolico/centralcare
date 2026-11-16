import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Sector,
} from "recharts";
import "./RHUDashboard.css";

const navItems = [
  { label: "Dashboard",       to: "/rhu/dashboard"         },
  { label: "Inventory",       to: "/rhu/inventory"         },
  { label: "Barangay",        to: "/rhu/barangay"          },
  { label: "Distribution",    to: "/rhu/distribution"      },
  { label: "Reports",         to: "/rhu/reports"           },
  { label: "Messages",        to: "/rhu/messages"          },
  { label: "Notifications",   to: "/rhu/notifications"     },
];

const DONUT_COLORS = ["#1a56db", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2026-09-15", "9/15/2026", a Date, or a Firestore timestamp -> "2026-09"
function monthKeyOf(value) {
  if (!value) return null;
  if (typeof value === "object" && value.seconds) value = new Date(value.seconds * 1000);
  if (value instanceof Date) {
    return isNaN(value) ? null : `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
  }
  const s = String(value).trim();
  let m = /^(\d{4})-(\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}`;
  m = /^(\d{1,2})\/\d{1,2}\/(\d{4})/.exec(s); // M/D/YYYY
  if (m) return `${m[2]}-${String(m[1]).padStart(2, "0")}`;
  const d = new Date(s);
  return isNaN(d) ? null : monthKeyOf(d);
}

// Years that have any received/distributed data, plus the current year (newest first)
function trendYears(receivedItems, distributionList) {
  const years = new Set([new Date().getFullYear()]);
  receivedItems.forEach(i => {
    const k = monthKeyOf(i.addedDate || i.receivedAt || i.date || i.createdAt || i.manufactureDate);
    if (k) years.add(Number(k.slice(0, 4)));
  });
  distributionList.forEach(d => {
    const k = monthKeyOf(d.date || d.createdAt);
    if (k) years.add(Number(k.slice(0, 4)));
  });
  return [...years].sort((a, b) => b - a);
}

// Boxes received vs. boxes distributed for EVERY month of the chosen year
// (Jan -> Dec); months with no activity show as 0.
function buildTrend(receivedItems, distributionList, year) {
  const map = {};
  const add = (key, field, n) => {
    if (!key || !key.startsWith(`${year}-`)) return;
    map[key] = map[key] || { received: 0, distributed: 0 };
    map[key][field] += Number(n) || 0;
  };
  receivedItems.forEach(i => add(monthKeyOf(i.addedDate || i.receivedAt || i.date || i.createdAt || i.manufactureDate), "received", i.quantity));
  distributionList.forEach(d => add(monthKeyOf(d.date || d.createdAt), "distributed", d.totalBoxes));
  return MONTH_SHORT.map((label, idx) => {
    const r = map[`${year}-${String(idx + 1).padStart(2, "0")}`] || { received: 0, distributed: 0 };
    return { month: label, received: r.received, distributed: r.distributed };
  });
}

// Donut you can hover or click: the chosen slice pops out, the rest fade,
// and the centre shows that slice's boxes. Every item gets a legend row
// (scrolls if there are many), including ones with 0 boxes.
function InteractiveDonut({ items, prefix }) {
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const active = hovered ?? selected;
  const ring = items.filter(i => i.value > 0);
  const total = ring.reduce((s, i) => s + i.value, 0);
  const colorOf = (name) => DONUT_COLORS[Math.max(0, items.findIndex(i => i.name === name)) % DONUT_COLORS.length];
  const activeItem = items.find(i => i.name === active);
  const activeIdx = ring.findIndex(i => i.name === active);
  const pct = (v) => (total ? Math.round((v / total) * 1000) / 10 : 0);
  const toggle = (name) => setSelected(prev => (prev === name ? null : name));

  return (
    <>
      <div className={`${prefix}-donut-wrap`}>
        <PieChart width={190} height={190}>
          <Pie data={ring} cx={90} cy={90} innerRadius={58} outerRadius={80} dataKey="value"
            startAngle={90} endAngle={-270} stroke="#fff"
            activeIndex={activeIdx >= 0 ? activeIdx : undefined}
            activeShape={(p) => <Sector {...p} outerRadius={p.outerRadius + 7} />}
            onMouseEnter={(_, i) => setHovered(ring[i]?.name ?? null)}
            onMouseLeave={() => setHovered(null)}
            onClick={(_, i) => toggle(ring[i]?.name)}
            style={{ cursor: "pointer" }}>
            {ring.map(r => (
              <Cell key={r.name} fill={colorOf(r.name)} fillOpacity={!active || active === r.name ? 1 : 0.25} />
            ))}
          </Pie>
        </PieChart>
        <div className={`${prefix}-donut-center`}>
          <p className={`${prefix}-donut-pct`}>{activeItem ? activeItem.value : total}</p>
          <p className={`${prefix}-donut-label`}>{activeItem ? `${pct(activeItem.value)}% OF TOTAL` : "BOXES"}</p>
        </div>
      </div>

      <p style={{ textAlign: "center", fontSize: 12, color: "#6b7280", margin: "0 0 8px", minHeight: 16 }}>
        {activeItem ? <><strong style={{ color: "#0f172a" }}>{activeItem.name}</strong> · {activeItem.value} boxes</> : "Hover or click a slice or a row to highlight it"}
      </p>

      <div className={`${prefix}-rhu-legend`} style={{ maxHeight: 240, overflowY: "auto", paddingRight: 4 }}>
        {items.map(it => {
          const isActive = active === it.name;
          return (
            <div key={it.name} className={`${prefix}-rhu-row`}
              onMouseEnter={() => setHovered(it.name)} onMouseLeave={() => setHovered(null)}
              onClick={() => toggle(it.name)}
              style={{
                cursor: "pointer", padding: "4px 8px", borderRadius: 6,
                background: isActive ? "#eff6ff" : "transparent",
                opacity: active && !isActive ? 0.55 : 1,
                outline: selected === it.name ? "1px solid #bfdbfe" : "none",
              }}>
              <span className={`${prefix}-rhu-dot`} style={{ background: colorOf(it.name) }} />
              <span className={`${prefix}-rhu-name`}>{it.name}</span>
              <span className={`${prefix}-rhu-pct`}>{it.value} boxes</span>
            </div>
          );
        })}
      </div>
    </>
  );
}

// Same collections/matching logic as RHUBarangay.jsx, so this dashboard stat
// and the Assigned Barangays page always agree on the same number.
const BARANGAYS_COLLECTION = "cho_barangays";
const RHU_REGISTRY_COLLECTION = "cho_rhu_registry";

const EXPIRY_WARNING_DAYS = 90; // "Expiring Soon" window (days)

export default function RHUDashboard() {
  const { logout, userData } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const unreadMessages = useUnreadMessageCount();
  const [search, setSearch] = useState("");
  const [trendYear, setTrendYear] = useState(new Date().getFullYear());
  const [inventory, setInventory] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [monthlyReports, setMonthlyReports] = useState([]);
  const [assignedBarangayCount, setAssignedBarangayCount] = useState(0);
  const [assignedBarangayNames, setAssignedBarangayNames] = useState([]);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);
  useEffect(() => { loadAssignedBarangayCount(); }, [userData]);

  // Mirrors RHUBarangay.jsx's loadAssignedBarangays() so "Total Barangays"
  // here always matches the count on the Assigned Barangays page instead of
  // being a hardcoded placeholder.
  async function loadAssignedBarangayCount() {
    try {
      const userRhuId = String(userData?.rhuId || "").trim().toLowerCase();
      const userRhuName = String(userData?.rhuName || "").trim().toLowerCase();

      let assignedKeys = [];

      if (userData?.rhuId) {
        const regRef = doc(db, RHU_REGISTRY_COLLECTION, String(userData.rhuId));
        const regSnap = await getDoc(regRef);
        if (regSnap.exists()) {
          assignedKeys = regSnap.data().assignedBarangays || [];
        }
      }

      if (assignedKeys.length === 0) {
        const regSnap = await getDocs(collection(db, RHU_REGISTRY_COLLECTION));
        regSnap.docs.forEach(d => {
          const data = d.data();
          const dRhuId = String(data.rhuId || "").trim().toLowerCase();
          const dRhuName = String(data.rhuName || d.id || "").trim().toLowerCase();
          if ((userRhuId && dRhuId === userRhuId) || (userRhuName && dRhuName === userRhuName)) {
            if (Array.isArray(data.assignedBarangays)) {
              assignedKeys = [...assignedKeys, ...data.assignedBarangays];
            }
          }
        });
      }

      const allSnap = await getDocs(collection(db, BARANGAYS_COLLECTION));
      const allBarangays = allSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const normalizedKeys = assignedKeys.map(k => String(k).trim().toLowerCase());

      const assigned = allBarangays.filter(b => {
        const bName = String(b.barangayName || b.name || "").trim().toLowerCase();
        const bId = String(b.id).trim().toLowerCase();
        const bRhuId = String(b.rhuId || b.assignedRhuId || "").trim().toLowerCase();
        const bRhuName = String(b.assignedRhu || b.rhuName || "").trim().toLowerCase();

        const inRegistry = normalizedKeys.includes(bName) || normalizedKeys.includes(bId);
        const directMatch = (userRhuId && bRhuId === userRhuId) || (userRhuName && bRhuName === userRhuName);

        return inRegistry || directMatch;
      });

      setAssignedBarangayCount(assigned.length);
      setAssignedBarangayNames(
        assigned.map(b => String(b.barangayName || b.name || b.id).trim()).filter(Boolean)
          .sort((a, b) => a.localeCompare(b))
      );
    } catch (err) {
      console.error("Error loading assigned barangay count:", err);
    }
  }

  async function loadData() {
    setLoading(true);
    try {
      const userRhuId = String(userData?.rhuId || "").trim().toLowerCase();
      const userRhuName = String(userData?.rhuName || "").trim().toLowerCase();

      // NOTE: Firestore where("rhuId","==",userData?.rhuId) is a strict, unnormalized
      // equality match. If userData.rhuId happens to be stored as a Number while the
      // inventory/distribution/notification docs store rhuId as a String (or any other
      // subtle format difference), this silently returns zero results with no error —
      // exactly the "No inventory data yet" symptom. Fetch by ownerType/fromType only,
      // then filter client-side with normalized (trimmed, lowercased) string comparison,
      // matching the same robust approach already used in RHUInventory.jsx.
      const [invSnap, distSnap, reportsSnap] = await Promise.all([
        getDocs(query(collection(db, "inventory"), where("ownerType", "==", "rhu"))),
        getDocs(query(collection(db, "rhu_distributions"))),
        getDocs(query(collection(db, "monthly_balance_reports"), where("ownerType", "==", "rhu")))
      ]);
      const matchesRhu = (idField, nameField) => {
        const itemRhuId = String(idField || "").trim().toLowerCase();
        const itemRhuName = String(nameField || "").trim().toLowerCase();
        const matchesId = userRhuId !== "" && itemRhuId === userRhuId;
        const matchesName = userRhuName !== "" && itemRhuName === userRhuName;
        return matchesId || matchesName;
      };

      const invList = invSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => matchesRhu(item.rhuId, item.rhuName || item.assignedRhu));

      const distList = distSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => matchesRhu(item.fromRhuId, item.fromRhuName));

      const reportsList = reportsSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(r => matchesRhu(r.ownerId, r.ownerName));

      setInventory(invList);
      setDistributions(distList);
      setMonthlyReports(reportsList);
    } catch (err) { console.error(err); }
    setLoading(false);
  }

  // Same accepted / pending split the Inventory page uses.
  const recvStatus = (i) => String(i.receivedStatus || "").trim().toLowerCase();
  const activeInv = inventory.filter(i => recvStatus(i) === "accepted" || recvStatus(i) === "received");
  const pendingCount = inventory.filter(i => recvStatus(i) === "" || recvStatus(i) === "pending").length;
  const totalBoxes = activeInv.reduce((s, i) => s + (i.remaining ?? i.quantity ?? 0), 0);

  const lowStockItems = inventory.filter(i => (i.remaining ?? i.quantity) <= 50);
  const expiringItems = inventory.filter(i => {
    if (!i.expiry) return false;
    const days = (new Date(i.expiry) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= EXPIRY_WARNING_DAYS && days >= 0;
  });

  // Inventory trend: boxes received into this RHU vs. boxes it distributed, per month
  const yearOptions = trendYears(activeInv, distributions);
  const trendData = buildTrend(activeInv, distributions, trendYear);
  const trendEmpty = trendData.every(r => !r.received && !r.distributed);

  // Distribution by barangay: only the barangays THIS RHU handles (from the
  // registry), each with the boxes it received -- including barangays still at 0.
  const barangayMap = {};
  distributions.forEach(d => {
    (d.barangayDistribution || []).forEach(b => {
      const key = String(b.name || "").trim().toLowerCase();
      barangayMap[key] = (barangayMap[key] || 0) + (b.boxes || 0);
    });
  });
  const pieData = assignedBarangayNames.map(name => ({
    name,
    value: barangayMap[name.toLowerCase()] || 0,
  }));

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
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="rhu-main">
        <header className="rhu-topbar">
          <input className="rhu-search" type="text"
            placeholder="Search patients, appointments, or medical records..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="rhu-topbar-right">
            <button className="rhu-notif-btn" onClick={() => navigate("/rhu/notifications")} style={{ position: "relative" }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
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
          <div className="rhu-page-header">
            <div>
              <h1 className="rhu-page-title">System Overview</h1>
              <p className="rhu-page-sub">Real-time status of healthcare distribution and inventory levels.</p>
            </div>
          </div>

          {/* Stat Cards */}
          <div className="rhu-stats-grid">
            <div className={`rhu-stat-card ${pendingCount > 0 ? "rhu-stat--blue" : ""}`}>
              <p className="rhu-stat-label">PENDING ACCEPTANCE</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">{pendingCount}</span>
                <NavLink to="/rhu/inventory" className="rhu-stat-arrow">›</NavLink>
              </div>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL BOXES</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{totalBoxes}</span></div>
              <p className="rhu-stat-sub">Accepted, in stock</p>
            </div>
            <div className="rhu-stat-card rhu-stat--orange">
              <p className="rhu-stat-label">LOW STOCK ALERTS</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">{lowStockItems.length}</span>
                <span className="rhu-stat-arrow">›</span>
              </div>
            </div>
            <div className="rhu-stat-card rhu-stat--red">
              <p className="rhu-stat-label">EXPIRING SOON</p>
              <div className="rhu-stat-row">
                <span className="rhu-stat-value">{expiringItems.length}</span>
                <span className="rhu-stat-arrow">›</span>
              </div>
            </div>
            <div className="rhu-stat-card">
              <p className="rhu-stat-label">TOTAL BARANGAYS</p>
              <div className="rhu-stat-row"><span className="rhu-stat-value">{assignedBarangayCount}</span></div>
              <p className="rhu-stat-sub">Active barangay health posts</p>
            </div>
          </div>

          {/* Charts */}
          <div className="rhu-charts-row">
            <div className="rhu-chart-card">
              <div className="rhu-section-hd">
                <h2 className="rhu-section-title">Inventory Trend</h2>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select value={trendYear} onChange={e => setTrendYear(Number(e.target.value))}
                    style={{ padding: "4px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", color: "#374151" }}>
                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span className="rhu-badge">Live</span>
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "-6px 0 10px" }}>Boxes received into your RHU stock vs. boxes you distributed, per month.</p>
              {trendEmpty ? (
                <div className="rhu-empty-small"><p>No inventory activity in {trendYear}.</p></div>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={trendData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="month" interval={0} tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#6b7280" }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 13 }} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="received" name="Received" stroke="#1a56db" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    <Line type="monotone" dataKey="distributed" name="Distributed" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rhu-chart-card">
              <div className="rhu-section-hd">
                <h2 className="rhu-section-title">Distribution by Barangay</h2>
              </div>
              {pieData.length === 0 ? (
                <div className="rhu-empty-small"><p>No barangays are assigned to your RHU yet.</p></div>
              ) : (
                <InteractiveDonut items={pieData} prefix="rhu" />
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}