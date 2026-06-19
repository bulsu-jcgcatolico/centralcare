import { useState, useRef } from "react";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase/config";
import { useNavigate, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import "./MidwifeAddPatient.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Notifications", to: "/midwife/notifications" },
];

function generatePatientId() {
  return "PT-" + Math.floor(10000 + Math.random() * 89999);
}

export default function MidwifeAddPatient({ type = "child" }) {
  const { logout, user, userData } = useAuth();
  const navigate = useNavigate();
  const [records, setRecords] = useState([{ id: 1 }]);
  const [saving, setSaving] = useState(false);

  // Use refs to collect form data without controlled inputs
  const formRef = useRef(null);

  function handleLogout() { logout(); navigate("/"); }
  function handleCancel() { navigate("/midwife/patients"); }
  function addRecord()    { setRecords(p => [...p, { id: Date.now() }]); }
  function removeRecord(id) {
    if (records.length > 1) setRecords(p => p.filter(r => r.id !== id));
  }

  async function handleSave() {
    if (!formRef.current) return;
    setSaving(true);
    try {
      // Collect all named inputs from the form
      const inputs = formRef.current.querySelectorAll("input[name], textarea[name]");
      const data = {};
      inputs.forEach(el => {
        if (el.type === "checkbox") {
          if (el.checked) {
            // Store multiple checkboxes with same name as array
            if (data[el.name]) {
              data[el.name] = Array.isArray(data[el.name])
                ? [...data[el.name], el.value]
                : [data[el.name], el.value];
            } else {
              data[el.name] = el.value;
            }
          }
        } else if (el.type === "radio") {
          if (el.checked) data[el.name] = el.value;
        } else {
          if (el.value) data[el.name] = el.value;
        }
      });

      const fullName = [data.lastName, data.firstName, data.middleName]
        .filter(Boolean).join(", ");

      await addDoc(collection(db, "patients"), {
        patientId:    generatePatientId(),
        type,
        name:         fullName,
        barangayName: userData?.barangayName ?? "",
        createdBy:    user?.uid ?? "",
        createdAt:    serverTimestamp(),
        lastVisit:    new Date().toLocaleDateString(),
        status:       "active",
        ...data,
      });

      alert("Patient record saved successfully!");
      navigate("/midwife/patients");
    } catch (error) {
      alert("Error saving: " + error.message);
    }
    setSaving(false);
  }

  const TA = {
    display: "block", width: "100%", minHeight: "140px", height: "140px",
    border: "1px solid #d1d5db", borderRadius: "6px", padding: "8px",
    fontSize: "13px", color: "#374151", background: "#fff",
    resize: "vertical", boxSizing: "border-box",
    fontFamily: "DM Sans, sans-serif", outline: "none",
  };

  const CHILD_VITALS = [
    "BP","HR","RR","WT","HT","TEMP",
    "Head Circum","Arm Circum","Arm Length",
    "Waist Circum","SkinFold Thickness","Limb Length"
  ];
  const ADULT_VITALS = ["BP","HR","RR","WT","HT","TEMP"];

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
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      <div className="midwife-main">
        <header className="midwife-topbar">
          <input className="midwife-search" type="text"
            placeholder="Search patients, medicine, or ID..." />
          <div className="midwife-topbar-right">
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
          <div className="ap-page-header">
            <h1 className="ap-page-title">
              Add New {type === "child" ? "Child" : "Adult"} Patient Record
            </h1>
            <button className="ap-print-btn" onClick={() => window.print()}>Print</button>
          </div>

          <form ref={formRef}>
            {/* ── PATIENT INFO ── */}
            <div className="ap-info-card">
              {type === "child" ? <ChildInfo /> : <AdultInfo />}
            </div>

            {/* ── CLINICAL RECORDS ── */}
            {records.map((rec, idx) => (
              <div key={rec.id} className="ap-clinical-card">
                <div style={{ width: "100%", overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
                  <table className="ap-clinical-table">
                    <thead>
                      <tr>
                        <th className="ap-th-date">DATE</th>
                        <th className="ap-th-vitals">VITAL SIGNS</th>
                        <th>CHIEF COMPLAINTS</th>
                        <th>DIAGNOSIS</th>
                        <th>MEDICATIONS / TREATMENT</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="ap-td-date">
                          <input type="date" className="ap-date-input"
                            name={`date_${idx}`} />
                        </td>
                        <td className="ap-td-vitals">
                          {(type === "child" ? CHILD_VITALS : ADULT_VITALS).map(v => (
                            <div key={v} className="ap-vital-row">
                              <span>{v}:</span>
                              <input type="text" name={`vital_${v}_${idx}`} />
                            </div>
                          ))}
                        </td>
                        <td className="ap-td-text">
                          <textarea name={`complaints_${idx}`} style={TA}
                            placeholder="Enter chief complaints..." />
                        </td>
                        <td className="ap-td-text">
                          <textarea name={`diagnosis_${idx}`} style={TA}
                            placeholder="Enter diagnosis..." />
                        </td>
                        <td className="ap-td-text">
                          <textarea name={`medications_${idx}`} style={TA}
                            placeholder="Enter medications / treatment..." />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                {records.length > 1 && (
                  <div className="ap-remove-wrap">
                    <button type="button" className="ap-remove-btn"
                      onClick={() => removeRecord(rec.id)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </form>

          {/* ── BOTTOM ACTIONS ── */}
          <div className="ap-bottom">
            <button type="button" className="ap-add-btn" onClick={addRecord}>
              + Add Another Record
            </button>
            <div className="ap-bottom-right">
              <button type="button" className="ap-cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
              <button type="button" className="ap-save-btn"
                onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Record"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── CHILD INFO ── */
function ChildInfo() {
  return (
    <div className="ap-info-grid">
      <div className="ap-info-col">
        <div className="ap-row"><span>Last Name:</span><input type="text" name="lastName" /></div>
        <div className="ap-row">
          <span>First Name:</span>
          <input type="text" name="firstName" className="ap-flex2" />
          <span className="ap-span-sm">Suffix:</span>
          <input type="text" name="suffix" className="ap-w80" />
        </div>
        <div className="ap-row"><span>Middle Name:</span><input type="text" name="middleName" /></div>
        <div className="ap-row"><span>Father's Name:</span><input type="text" name="fatherName" /></div>
        <div className="ap-row"><span>Mother's Name:</span><input type="text" name="motherName" /></div>
        <div className="ap-row"><span>Contact Number:</span><input type="text" name="contact" /></div>
        <div className="ap-row"><span>Religion:</span><input type="text" name="religion" /></div>
        <div className="ap-row"><span>PhilHealth:</span><input type="text" name="philHealth" /></div>
        <div className="ap-row">
          <span>Member's Name:</span>
          <input type="text" name="memberName" placeholder="Last Name, First Name, Middle Name" />
        </div>
      </div>
      <div className="ap-info-col">
        <div className="ap-row">
          <span>Birthday:</span><input type="date" name="birthday" className="ap-w130" />
          <span className="ap-span-sm">Age:</span><input type="number" name="age" className="ap-w60" />
          <span className="ap-span-sm">Sex:</span><input type="text" name="sex" className="ap-w60" />
        </div>
        <div className="ap-row"><span>BirthPlace:</span><input type="text" name="birthPlace" /></div>
        <div className="ap-row">
          <span>Place Delivered:</span>
          <label className="ap-cb"><input type="checkbox" name="placeDelivered" value="Lying In" />Lying In</label>
          <label className="ap-cb"><input type="checkbox" name="placeDelivered" value="Hospital" />Hospital</label>
          <label className="ap-cb"><input type="checkbox" name="placeDelivered" value="Others" />Others:</label>
          <input type="text" name="placeDeliveredOther" className="ap-w80" />
        </div>
        <div className="ap-row">
          <span>Type of Delivery:</span>
          <label className="ap-cb"><input type="checkbox" name="deliveryType" value="NSD" />NSD</label>
          <label className="ap-cb"><input type="checkbox" name="deliveryType" value="CS" />CS</label>
        </div>
        <div className="ap-row"><span>Birth Length:</span><input type="text" name="birthLength" className="ap-w120" /></div>
        <div className="ap-row"><span>Birth Weight:</span><input type="text" name="birthWeight" className="ap-w120" /></div>
        <div className="ap-row"><span>Attendant at Birth:</span><input type="text" name="attendantBirth" /></div>
        <div className="ap-row"><span>Complete Address:</span><input type="text" name="address" /></div>
      </div>

      {/* Immunization */}
      <div className="ap-immun-section">
        <div className="ap-immun-header">
          <div>IMMUNIZATION</div><div>Date</div>
          <div>IMMUNIZATION</div><div>Date</div>
          <div>IMMUNIZATION</div><div>Date</div>
        </div>
        <div className="ap-immun-body">
          {[
            ["BCG","HEPA B W/IN 24 HOURS","HEPA B >= 24 HOURS","PENTAVALENT 1","PENTAVALENT 2","PENTAVALENT 3","MCV 1 (AMV)","MCV 2 (MMR)"],
            ["OPV 1","OPV 2","OPV 3","ROTA 1","ROTA 2","PCV 1","PCV 2","PCV 3"],
            ["IPV 1","IPV 2","HEPA A","PNEUMONIA","INFLUENZA","OTHERS","NBST","EBF"]
          ].map((col, ci) => (
            <div key={ci} className="ap-immun-col">
              {col.map(v => (
                <div key={v} className="ap-immun-row">
                  <span>{v}:</span>
                  <input type="date" name={`immun_${v}`} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── ADULT INFO ── */
function AdultInfo() {
  return (
    <div className="ap-info-grid">
      <div className="ap-info-col">
        <div className="ap-row"><span>Last Name:</span><input type="text" name="lastName" /></div>
        <div className="ap-row">
          <span>First Name:</span>
          <input type="text" name="firstName" className="ap-flex2" />
          <span className="ap-span-sm">Suffix:</span>
          <input type="text" name="suffix" className="ap-w80" />
        </div>
        <div className="ap-row"><span>Middle Name:</span><input type="text" name="middleName" /></div>
        <div className="ap-row"><span>Civil Status:</span><input type="text" name="civilStatus" /></div>
        <div className="ap-row">
          <span>Maiden Name:</span>
          <input type="text" name="maidenName" placeholder="For Married Women" />
        </div>
        <div className="ap-row"><span>PhilHealth #:</span><input type="text" name="philHealth" /></div>
        <div className="ap-row">
          <span>Name:</span>
          <input type="text" name="memberName" placeholder="Last Name, First Name, Middle Name" />
        </div>
        <div className="ap-row"><span>Member's Birthday:</span><input type="date" name="memberBirthday" /></div>
        <div className="ap-row">
          <span>Family Member:</span>
          <label className="ap-cb"><input type="checkbox" name="familyMember" value="Head" />Head</label>
          <label className="ap-cb"><input type="checkbox" name="familyMember" value="Spouse" />Spouse</label>
          <label className="ap-cb"><input type="checkbox" name="familyMember" value="Child" />Child</label>
          <label className="ap-cb"><input type="checkbox" name="familyMember" value="Others" />Others</label>
        </div>
      </div>
      <div className="ap-info-col">
        <div className="ap-row">
          <span>Birthday:</span><input type="date" name="birthday" className="ap-w130" />
          <span className="ap-span-sm">Age:</span><input type="number" name="age" className="ap-w60" />
          <span className="ap-span-sm">Sex:</span><input type="text" name="sex" className="ap-w60" />
        </div>
        <div className="ap-row"><span>BirthPlace:</span><input type="text" name="birthPlace" /></div>
        <div className="ap-row"><span>Blood Type:</span><input type="text" name="bloodType" /></div>
        <div className="ap-row"><span>Father's Name:</span><input type="text" name="fatherName" /></div>
        <div className="ap-row"><span>Mother's Name:</span><input type="text" name="motherName" /></div>
        <div className="ap-row"><span>Contact Number:</span><input type="text" name="contact" /></div>
        <div className="ap-row"><span>Religion:</span><input type="text" name="religion" /></div>
        <div className="ap-row"><span>Name of Spouse:</span><input type="text" name="spouseName" /></div>
        <div className="ap-row"><span>Complete Address:</span><input type="text" name="address" /></div>
        <div className="ap-row"><span>Educational Attainment:</span><input type="text" name="education" /></div>
      </div>

      {/* Female section */}
      <div className="ap-female-section">
        <p className="ap-female-title">For Female Patient Only:</p>
        <div className="ap-female-grid">
          <div className="ap-row"><span>Age of Menarche Started:</span><input type="text" name="menarche" /></div>
          <div className="ap-row"><span>LMP:</span><input type="text" name="lmp" /></div>
          <div className="ap-row"><span>Gravidity:</span><input type="text" name="gravidity" /></div>
          <div className="ap-row"><span>EDC (If Pregnant):</span><input type="text" name="edc" /></div>
          <div className="ap-row"><span>Parity:</span><input type="text" name="parity" /></div>
        </div>
        <div className="ap-parity-row">
          {["Full Term","Preterm","Abortion","Livebirth"].map(p => (
            <div key={p} className="ap-parity-item">
              <label>{p}</label>
              <input type="text" name={p.toLowerCase().replace(" ", "")} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}