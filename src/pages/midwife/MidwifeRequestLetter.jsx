import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./MidwifeRequestLetter.css";

export default function MidwifeRequestLetter() {
  const { userData } = useAuth();
  const navigate = useNavigate();

  const today = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const [letterBody, setLetterBody] = useState("");

  function handlePrint() {
    window.print();
  }

  function handleExportPDF() {
    // Implementation for exporting as PDF
  }

  return (
    <div className="rl-wrapper">
      {/* ── Top Bar / Action Controls ── */}
      <header className="rl-topbar">
        <div className="rl-topbar-left">
          <button 
            className="rl-btn-back" 
            onClick={() => navigate("/midwife/inventory")}
            title="Return to Inventory"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
              <line x1="19" y1="12" x2="5" y2="12" />
              <polyline points="12 19 5 12 12 5" />
            </svg>
            Back to Inventory
          </button>
          <span className="rl-topbar-divider"></span>
          <h1 className="rl-topbar-title">Requisition Letter Generator</h1>
        </div>

        <div className="rl-topbar-actions">
          <button className="rl-btn-outline" onClick={handleExportPDF}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export PDF
          </button>
          <button className="rl-btn-primary" onClick={handlePrint}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <polyline points="6 9 6 2 18 2 18 9" />
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
              <rect x="6" y="14" width="12" height="8" />
            </svg>
            Print Letter
          </button>
        </div>
      </header>

      {/* ── Document View Canvas ── */}
      <main className="rl-main">
        <div className="rl-paper" id="letter-paper">
          
          {/* Official Letterhead */}
          <div className="rl-letterhead">
            <p className="rl-republic">Republic of the Philippines</p>
            <p className="rl-province">Province of Bulacan</p>
            <p className="rl-municipality">City of Malolos</p>
            <p className="rl-bhs-name">BARANGAY HEALTH STATION — {userData?.barangayName?.toUpperCase() || "LONGOS"}</p>
            <div className="rl-header-line"></div>
          </div>

          <p className="rl-date">Date: <strong>{today}</strong></p>

          <div className="rl-recipients">
            <div className="rl-recipient-block">
              <p className="rl-recipient-title">HON. BARANGAY CAPTAIN</p>
              <p>Barangay {userData?.barangayName || "Longos"}, City of Malolos</p>
            </div>

            <div className="rl-recipient-block">
              <p className="rl-recipient-title">HON. BARANGAY KONSEHAL</p>
              <p>Committee Chair on Health</p>
              <p>Barangay {userData?.barangayName || "Longos"}, City of Malolos</p>
            </div>
          </div>

          <div className="rl-subject">
            <strong>SUBJECT:</strong> REQUISITION REQUEST FOR MEDICINES AND MEDICAL SUPPLIES
          </div>

          <div className="rl-salutation">
            <p>Magandang Araw / Good day,</p>
          </div>

          <div className="rl-body">
            <textarea
              className="rl-textarea"
              rows={10}
              placeholder="Type your request letter details here (e.g. detailed list of required medicines, quantities, or urgent inventory supplies needed for the station)..."
              value={letterBody}
              onChange={(e) => setLetterBody(e.target.value)}
            />
          </div>

          <div className="rl-closing">
            <p>Gumagalang,</p>
            <div className="rl-signatory">
              <p className="rl-signatory-name">
                {userData?.username || "Maria A. Santos"}
              </p>
              <p className="rl-signatory-role">Midwife II</p>
              <p className="rl-signatory-station">
                Barangay Health Station — {userData?.barangayName || "Longos"}
              </p>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}