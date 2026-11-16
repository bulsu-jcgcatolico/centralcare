import { useState, useEffect } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useUnreadMessageCount } from "../../hooks/useUnreadMessageCount";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Sector,
} from "recharts";
import "./CHODashboard.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Messages",          to: "/cho/messages"           },
  { label: "Notifications",     to: "/cho/notifications"      },
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

const EXPIRY_WARNING_DAYS = 90; // "Expiring Soon" window (days)

export default function CHODashboard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const unreadMessages = useUnreadMessageCount();
  const [search, setSearch] = useState("");
  const [trendYear, setTrendYear] = useState(new Date().getFullYear());
  const [inventory, setInventory] = useState([]);
  const [distributions, setDistributions] = useState([]);
  const [choBatches, setChoBatches] = useState([]);
  const [totalMalolosPopulation, setTotalMalolosPopulation] = useState(0);
  const [loading, setLoading] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [invSnap, distSnap, barangaySnap, choBatchSnap] = await Promise.all([
        getDocs(collection(db, "inventory")),
        getDocs(query(collection(db, "distributions"), where("fromType", "==", "cho"))),
        getDocs(collection(db, "cho_barangays")),
        getDocs(query(
          collection(db, "cho_batches"),
          where("ownerType", "==", "cho"),
          where("status", "==", "Accepted")
        ))
      ]);
      setInventory(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setDistributions(distSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setChoBatches(choBatchSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const totalPop = barangaySnap.docs.reduce((sum, doc) => {
        const data = doc.data();
        return sum + Number(data.population ?? data.totalPopulation ?? 0);
      }, 0);
      setTotalMalolosPopulation(totalPop);

    } catch (err) { console.error(err); }
    setLoading(false);
  }

  const lowStockItems   = inventory.filter(i => (i.remaining ?? i.quantity) <= 50);
  const criticalItems   = inventory.filter(i => (i.remaining ?? i.quantity) <= 20);
  // "Expiring Soon" is a CHO-level stat, so it should reflect CHO's own
  // batch stock (cho_batches / expiryDate) — not the RHU/Midwife-owned
  // `inventory` collection, which doesn't represent what's sitting in the
  // CHO warehouse. This was checking the wrong collection/field entirely,
  // which is why it always read 0 regardless of real expiring stock.
  const expiringItems   = choBatches.filter(b => {
    if (!b.expiryDate) return false;
    const remaining = b.remaining ?? b.quantity ?? 0;
    if (remaining <= 0) return false;
    const days = (new Date(b.expiryDate) - new Date()) / (1000 * 60 * 60 * 24);
    return days <= EXPIRY_WARNING_DAYS && days >= 0;
  });

  // Inventory trend: boxes received into CHO stock vs. boxes distributed, per month
  const yearOptions = trendYears(choBatches, distributions);
  const trendData = buildTrend(choBatches, distributions, trendYear);
  const trendEmpty = trendData.every(r => !r.received && !r.distributed);

  // Distribution by RHU: every RHU that has received boxes (no 5-item cap)
  const rhuMap = {};
  distributions.forEach(d => {
    (d.rhuDistribution || []).forEach(r => {
      rhuMap[r.name] = (rhuMap[r.name] || 0) + (r.boxes || 0);
    });
  });
  const rhuNumber = (name) => parseInt((String(name).match(/\d+/) || [0])[0], 10);
  const pieData = Object.entries(rhuMap)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => rhuNumber(a.name) - rhuNumber(b.name));

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
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to}
              className={({ isActive }) => "cho-nav-item" + (isActive ? " active" : "")}>
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
        <div className="cho-sidebar-footer">
          <NavLink to="/cho/settings" className={({ isActive }) => "cho-nav-item cho-nav-btn" + (isActive ? " active" : "")}>Settings</NavLink>
          <button className="cho-nav-item cho-nav-btn cho-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="cho-main">
        <header className="cho-topbar">
          <input className="cho-search" type="text"
            placeholder="Search medical supplies, RHUs, or records..."
            value={search} onChange={e => setSearch(e.target.value)} />
          <div className="cho-topbar-right">
            <button className="cho-notif-btn" onClick={() => navigate("/cho/notifications")} style={{ position: "relative" }}>
              <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20">
                <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
              </svg>
              {Boolean(unreadCount) && (
                <span className="nav-badge" style={{ position: "absolute", top: "-4px", right: "-4px" }}>
                  {unreadCount}
                </span>
              )}
            </button>
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
              <h1 className="cho-page-title">System Overview</h1>
              <p className="cho-page-sub">Real-time status of healthcare distribution and inventory levels.</p>
            </div>
          </div>

          <div className="cho-stats-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))" }}>
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL MALOLOS POPULATION</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{totalMalolosPopulation.toLocaleString()}</span>
              </div>
              <p className="cho-stat-sub">Combined population of all barangays</p>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL BATCHES</p>
              <div className="cho-stat-row"><span className="cho-stat-value">{choBatches.length}</span></div>
              <p className="cho-stat-sub">Accepted batches in CHO stock</p>
            </div>
            <div className="cho-stat-card cho-stat--green">
              <p className="cho-stat-label">REMAINING MEDICINES / BOXES</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{choBatches.reduce((s, b) => s + ((b.remaining ?? b.quantity) || 0), 0)}</span>
              </div>
              <p className="cho-stat-sub">Currently in stock</p>
            </div>
            <div className="cho-stat-card cho-stat--orange">
              <p className="cho-stat-label">LOW STOCK ALERTS</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{lowStockItems.length}</span>
                <span className="cho-stat-arrow">›</span>
              </div>
            </div>
            <div className="cho-stat-card cho-stat--red">
              <p className="cho-stat-label">EXPIRING SOON</p>
              <div className="cho-stat-row">
                <span className="cho-stat-value">{expiringItems.length}</span>
                <span className="cho-stat-arrow">›</span>
              </div>
            </div>
            <div className="cho-stat-card">
              <p className="cho-stat-label">TOTAL RHUS</p>
              <div className="cho-stat-row"><span className="cho-stat-value">10</span></div>
              <p className="cho-stat-sub">Rural Health Units</p>
            </div>
          </div>

          <div className="cho-charts-row">
            <div className="cho-chart-card">
              <div className="cho-section-hd">
                <h2 className="cho-section-title">Inventory Trend</h2>
                <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select value={trendYear} onChange={e => setTrendYear(Number(e.target.value))}
                    style={{ padding: "4px 8px", fontSize: 12, border: "1px solid #d1d5db", borderRadius: 6, background: "#fff", color: "#374151" }}>
                    {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <span className="cho-badge">Live</span>
                </span>
              </div>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "-6px 0 10px" }}>Boxes received into CHO stock vs. boxes distributed, per month.</p>
              {trendEmpty ? (
                <div className="cho-empty-small"><p>No inventory activity in {trendYear}.</p></div>
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

            <div className="cho-chart-card">
              <div className="cho-section-hd">
                <h2 className="cho-section-title">Distribution by RHU</h2>
              </div>
              {pieData.length === 0 ? (
                <div className="cho-empty-small"><p>No distribution data yet.</p></div>
              ) : (
                <InteractiveDonut items={pieData} prefix="cho" />
              )}
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}