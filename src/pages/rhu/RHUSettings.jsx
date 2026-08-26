import { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./RHUSettings.css";

const navItems = [
  { label: "Dashboard",     to: "/rhu/dashboard"     },
  { label: "Inventory",     to: "/rhu/inventory"     },
  { label: "Barangay",      to: "/rhu/barangay"      },
  { label: "Distribution",  to: "/rhu/distribution"  },
  { label: "Reports",       to: "/rhu/reports"       },
  { label: "Messages",      to: "/rhu/messages"      },
  { label: "Notifications", to: "/rhu/notifications" },
];

export default function RHUSettings() {
  const { logout, user, userData, changePassword } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const { showToast } = useToast();

  const rhuNumber = String(userData?.rhuId ?? "").match(/\d+/)?.[0];
  const displayName = rhuNumber ? `RHU ${rhuNumber} Admin` : (userData?.username || "RHU Admin");

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
          <NavLink to="/rhu/settings" className="rhu-nav-item rhu-nav-btn">
            Settings
          </NavLink>
          <button className="rhu-nav-item rhu-nav-btn rhu-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="rhu-main">
        <header className="rhu-topbar">
          <div className="rhu-topbar-right" style={{ marginLeft: "auto" }}>
            <div className="rhu-user">
              <div className="rhu-user-info">
                <span className="rhu-user-name">{displayName}</span>
              </div>
              <div className="rhu-avatar">RH</div>
            </div>
          </div>
        </header>

        <main className="rhu-content">
          <div className="rhu-page-header" style={{ marginBottom: "16px" }}>
            <div>
              <h1 className="rhu-page-title">Settings</h1>
              <p className="rhu-page-sub">Manage your account profile and security.</p>
            </div>
          </div>

          {/* ── Profile Info ── */}
          <section className="rhu-settings-card" style={{ marginBottom: "20px", padding: "20px" }}>
            <div className="rhu-settings-section-title">Profile Information</div>
            <div className="rhu-settings-profile-box">
              <div className="rhu-settings-profile-row">
                <span>Name</span>
                <strong>{displayName}</strong>
              </div>
              <div className="rhu-settings-profile-row">
                <span>Email</span>
                <strong>{user?.email || "—"}</strong>
              </div>
              <div className="rhu-settings-profile-row">
                <span>RHU ID</span>
                <strong>{rhuNumber ? `RHU ${rhuNumber}` : "—"}</strong>
              </div>
            </div>
            <p className="rhu-settings-hint">
              Display name and RHU assignment are managed by CHO. Contact CHO if this needs to change.
            </p>
          </section>

          {/* ── Change Password ── */}
          <section className="rhu-settings-card" style={{ padding: "20px", marginBottom: "24px" }}>
            <div className="rhu-settings-section-title">Change Password</div>
            <form onSubmit={handleChangePassword} className="rhu-settings-form">
              <div className="rhu-form-field">
                <label className="rhu-label">Current Password</label>
                <input className="rhu-input" type="password" autoComplete="current-password"
                  value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="rhu-form-field">
                <label className="rhu-label">New Password</label>
                <input className="rhu-input" type="password" autoComplete="new-password"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <div className="rhu-form-field">
                <label className="rhu-label">Confirm New Password</label>
                <input className="rhu-input" type="password" autoComplete="new-password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <p className="rhu-settings-hint">Password must be at least 6 characters.</p>
              <button type="submit" className="rhu-btn-primary" disabled={saving}>
                {saving ? "Updating..." : "Update Password"}
              </button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}