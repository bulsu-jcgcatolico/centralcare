import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./MidwifeRequestLetter.css";

export default function MidwifeRequestLetter() {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toLocaleDateString("en-US", {
    month: "2-digit",
    day:   "2-digit",
    year:  "numeric",
  });

  const [letterBody, setLetterBody] = useState("");

  function handlePrint() {
    window.print();
  }

  function handleExportPDF() {
    window.print();
  }

  return (
    <div className="rl-wrapper">

      {/* ── Top Bar ── */}
      <header className="rl-topbar">
        <h1 className="rl-topbar-title">Request Letter</h1>
        <div className="rl-topbar-actions">
          <button className="rl-btn-outline" onClick={handleExportPDF}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              width="14" height="14">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Export PDF
          </button>
          <button className="rl-btn-outline" onClick={handlePrint}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              width="14" height="14">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Print File
          </button>
        </div>
      </header>

      {/* ── Letter Paper ── */}
      <main className="rl-main">
        <div className="rl-paper" id="letter-paper">

          <h2 className="rl-paper-title">Request for Supplies</h2>

          <p className="rl-date">Date: {today}</p>

          <div className="rl-recipient">
            <p>Brgy. Kapitan</p>
            <p>Barangay {userData?.barangayName || "Longos"}</p>
          </div>

          <div className="rl-recipient" style={{ marginTop: "1rem" }}>
            <p>Brgy. Konsehal (Pangkalusugan)</p>
            <p>Barangay {userData?.barangayName || "Longos"}</p>
          </div>

          <div className="rl-body">
            <textarea
              className="rl-textarea"
              rows={12}
              placeholder="Write your request here..."
              value={letterBody}
              onChange={e => setLetterBody(e.target.value)}
            />
          </div>

          <div className="rl-closing">
            <p>Gumagalang,</p>
            <div className="rl-signatory">
              <p className="rl-signatory-name">
                {userData?.username || "Maria A. Santos"}
              </p>
              <p className="rl-signatory-role">Midwife II</p>
              <p className="rl-signatory-role">
                BHS-{userData?.barangayName || "Longos"}
              </p>
            </div>
          </div>

        </div>
      </main>

    </div>
  );
}