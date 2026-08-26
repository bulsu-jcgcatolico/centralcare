import { useState } from "react";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./CHOSettings.css";

const navItems = [
  { label: "Dashboard",         to: "/cho/dashboard"          },
  { label: "Item Management",   to: "/cho/item-management"    },
  { label: "Batch Inventory",   to: "/cho/batch-inventory"    },
  { label: "Barangay",          to: "/cho/barangay"           },
  { label: "RHU Management",    to: "/cho/rhu-management"     },
  { label: "Population Report", to: "/cho/population-report"  },
  { label: "Batch Distribution",to: "/cho/batch-distribution" },
  { label: "Reports",           to: "/cho/reports"            },
  { label: "Messages",          to: "/cho/messages"           },
  { label: "Notifications",     to: "/cho/notifications"      },
];

export default function CHOSettings() {
  const { logout, user, userData, changePassword } = useAuth();
  const navigate = useNavigate();
  const unreadCount = useUnreadCount();
  const { showToast } = useToast();

  const choName = user?.displayName || user?.name || "CHO Administrator";

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
              {item.label === "Notifications" && unreadCount > 0 && (
                <span className="nav-badge">{unreadCount}</span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="cho-sidebar-footer">
          <NavLink to="/cho/settings" className="cho-nav-item cho-nav-btn">
            Settings
          </NavLink>
          <button className="cho-nav-item cho-nav-btn cho-signout" onClick={handleLogout}>Sign out</button>
        </div>
      </aside>

      <div className="cho-main">
        <header className="cho-topbar">
          <div className="cho-topbar-right" style={{ marginLeft: "auto" }}>
            <div className="cho-user">
              <div className="cho-user-info">
                <span className="cho-user-name">{choName}</span>
                <span className="cho-user-role">CHO Administrator</span>
              </div>
              <div className="cho-avatar">CHO</div>
            </div>
          </div>
        </header>

        <main className="cho-content">
          <div className="cho-page-header" style={{ marginBottom: "16px" }}>
            <div>
              <h1 className="cho-page-title">Settings</h1>
              <p className="cho-page-sub">Manage your account profile and security.</p>
            </div>
          </div>

          {/* ── Profile Info ── */}
          <section className="cho-section" style={{ marginBottom: "20px" }}>
            <div className="cho-settings-section-title">Profile Information</div>
            <div className="cho-settings-profile-box">
              <div className="cho-settings-profile-row">
                <span>Name</span>
                <strong>{choName}</strong>
              </div>
              <div className="cho-settings-profile-row">
                <span>Email</span>
                <strong>{user?.email || "—"}</strong>
              </div>
              <div className="cho-settings-profile-row">
                <span>Role</span>
                <strong>{userData?.role ? userData.role.toUpperCase() : "CHO Administrator"}</strong>
              </div>
            </div>
            <p className="cho-settings-hint">
              Display name is managed by your account administrator. Contact IT support if this needs to change.
            </p>
          </section>

          {/* ── Change Password ── */}
          <section className="cho-section" style={{ marginBottom: "24px" }}>
            <div className="cho-settings-section-title">Change Password</div>
            <form onSubmit={handleChangePassword} className="cho-settings-form">
              <div className="cho-form-field">
                <label className="cho-label">Current Password</label>
                <input className="cho-input" type="password" autoComplete="current-password"
                  value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
              </div>
              <div className="cho-form-field">
                <label className="cho-label">New Password</label>
                <input className="cho-input" type="password" autoComplete="new-password"
                  value={newPassword} onChange={e => setNewPassword(e.target.value)} />
              </div>
              <div className="cho-form-field">
                <label className="cho-label">Confirm New Password</label>
                <input className="cho-input" type="password" autoComplete="new-password"
                  value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
              </div>
              <p className="cho-settings-hint">Password must be at least 6 characters.</p>
              <button type="submit" className="cho-btn-primary" disabled={saving}>
                {saving ? "Updating..." : "Update Password"}
              </button>
            </form>
          </section>
        </main>
      </div>
    </div>
  );
}