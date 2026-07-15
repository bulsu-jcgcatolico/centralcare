import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./Login.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      if (result.role === "cho") navigate("/cho/dashboard");
      else if (result.role === "rhu") navigate("/rhu/dashboard");
      else if (result.role === "midwife") navigate("/midwife/dashboard");
    } else {
      setError(result.message);
    }

    setLoading(false);
  }

  return (
    <div className="login-page">

      {/* ── Left: Form ─────────────────────────────────────────── */}
      <div className="login-form-side">
        <div className="login-card">

          {/* Logo */}
          <div className="login-logo">
            <div className="login-logo-icon">
              <svg viewBox="0 0 24 24" fill="white" width="26" height="26">
                <path d="M19 3H5C3.9 3 3 3.9 3 5v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 3c.55 0 1 .45 1 1v3h3c.55 0 1 .45 1 1s-.45 1-1 1h-3v3c0 .55-.45 1-1 1s-1-.45-1-1v-3H8c-.55 0-1-.45-1-1s.45-1 1-1h3V7c0-.55.45-1 1-1z"/>
              </svg>
            </div>
          </div>

          <h1 className="login-title">CentralCare Health System</h1>
          <p className="login-sub">Welcome back, please sign in to your account</p>

          {/* Error */}
          {error && <div className="login-error">{error}</div>}

          {/* Form */}
          <form onSubmit={handleLogin} className="login-form">

            <div className="login-field">
              <label>Email / Username</label>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                    <polyline points="22,6 12,13 2,6"/>
                  </svg>
                </span>
                <input
                  type="text"
                  placeholder="Enter your email or username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <div className="login-field-header">
                <label>Password</label>
              </div>
              <div className="login-input-wrap">
                <span className="login-input-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                </span>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className="login-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Keep me signed in */}
            <div className="login-row">
              <label className="login-checkbox-label">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                />
                <span>Keep me signed in</span>
              </label>
            </div>

            <button type="submit" className="login-btn" disabled={loading}>
              {loading ? "Signing in..." : (
                <>
                  Sign In
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                    <line x1="5" y1="12" x2="19" y2="12"/>
                    <polyline points="12 5 19 12 12 19"/>
                  </svg>
                </>
              )}
            </button>

          </form>

          <div className="login-footer">
            <p>Don't have an Account? <a href="mailto:it@centralcare.com">Contact IT Support</a></p>
          </div>

          <div className="login-copyright">
            <p>© 2024 CentralCare Health System. All rights reserved.</p>
          </div>

        </div>
      </div>

      {/* ── Right: Image panel with heading ─────────────────────────── */}
      <div className="login-visual-side">
        {<img className="login-visual-image" src="/city-hall.jpg" alt="..." />}
        
        <div className="login-visual-content">
          <p className="login-visual-eyebrow">Welcome to</p>
          <h2 className="login-visual-title">CentralCare Health System</h2>
        </div>
      </div>

    </div>
  );
}