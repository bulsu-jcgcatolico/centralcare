import { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./MidwifeSettings.css";

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

export default function MidwifeSettings() {
  const { logout, user, userData, changePassword } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const unreadCount = useUnreadCount();

  const currentBrgyName = userData?.barangayName || userData?.barangay || "Longos";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  function handleLogout() { logout(); navigate("/"); }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (!currentPassword || !newPassword || !confirmPassword) {
      showToast("Please fill in all password fields.", "error");
      return;
    }
    if (newPassword.length < 6) {
      showToast("New password must be at least 6 characters.", "error");
      return;
    }
    if (newPassword !== confirmPassword) {
      showToast("New password and confirmation don't match.", "error");
      return;
    }
    setSaving(true);
    const result = await changePassword(currentPassword, newPassword);
    setSaving(false);
    if (result.success) {
      showToast("Password updated successfully!", "success");
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } else {
      showToast(result.message, "error");
    }
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
            <p className="midwife-brand-role">BRGY. {currentBrgyName.toUpperCase()} PANEL</p>
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
          <NavLink to="/midwife/settings" className="midwife-nav-item midwife-nav-btn">
            Settings
          </NavLink>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="midwife-main">
        <header className="midwife-topbar">
          <div className="midwife-topbar-right" style={{ marginLeft: "auto" }}>
            <div className="midwife-user">
              <div className="midwife-user-info">
                <span className="midwife-user-name">Midwife ({currentBrgyName})</span>
                <span className="midwife-user-role">Barangay Health Station</span>
              </div>
              <div className="midwife-avatar">
                {currentBrgyName.substring(0, 2).toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="midwife-content">
          <div className="rhu-page-header" style={{ marginBottom: "16px" }}>
            <div>
              <h1 className="rhu-page-title">Settings</h1>
              <p className="rhu-page-sub">Manage your account profile and security.</p>
            </div>
          </div>

          {/* ── Profile Info ── */}
          <section className="midwife-settings-card" style={{ marginBottom: "20px" }}>
            <div className="midwife-settings-section-title">Profile Information</div>
            <div className="midwife-settings-profile-box">
              <div className="midwife-settings-profile-row">
                <span>Name</span>
                <strong>{userData?.username || "Midwife"}</strong>
              </div>
              <div className="midwife-settings-profile-row">
                <span>Email</span>
                <strong>{user?.email || "—"}</strong>
              </div>
              <div className="midwife-settings-profile-row">
                <span>Barangay</span>
                <strong>{currentBrgyName}</strong>
              </div>
            </div>
            <p className="midwife-settings-hint">
              Display name and barangay assignment are managed by RHU/CHO. Contact them if this needs to change.
            </p>
          </section>

          {/* ── Change Password ── */}
          <section className="midwife-settings-card" style={{ marginBottom: "24px" }}>
            <div className="midwife-settings-section-title">Change Password</div>
            <form onSubmit={handleChangePassword} className="midwife-settings-form">
              <div className="midwife-settings-field">
                <label className="midwife-settings-label">Current Password</label>
                <input className="midwife-settings-input" type="password" autoComplete="current-password"
                  value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="midwife-settings-field">
                <label className="midwife-settings-label">New Password</label>
                <input className="midwife-settings-input" type="password" autoComplete="new-password"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <div className="midwife-settings-field">
                <label className="midwife-settings-label">Confirm New Password</label>
                <input className="midwife-settings-input" type="password" autoComplete="new-password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <p className="midwife-settings-hint">Password must be at least 6 characters.</p>
              <button type="submit" className="midwife-btn-primary" disabled={saving}
                style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "8px", cursor: "pointer", fontWeight: "600" }}>
                {saving ? "Updating..." : "Update Password"}
              </button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}