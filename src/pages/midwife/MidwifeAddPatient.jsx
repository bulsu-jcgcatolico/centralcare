import { useState, useEffect, useRef } from "react";
import {
  collection, addDoc, updateDoc, doc, getDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useNavigate, useParams, NavLink } from "react-router-dom";
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

function makeEmptyRecord(id) {
  return {
    id, date: "", bp: "", hr: "", rr: "", wt: "", ht: "", temp: "",
    headCircum: "", armCircum: "", armLength: "", waistCircum: "",
    skinFold: "", limbLength: "",
    complaints: "", diagnosis: "", medications: ""
  };
}

/**
 * Works in two modes:
 *  - Add mode:  <MidwifeAddPatient type="child" />          → route /midwife/patients/add/child
 *  - Edit mode: <MidwifeAddPatient mode="edit" />            → route /midwife/patients/edit/:id
 *               (patient's existing `type` is loaded from Firebase, no need to pass it)
 */
export default function MidwifeAddPatient({ type: typeProp = "child", mode = "add" }) {
  const { logout, user, userData } = useAuth();
  const navigate = useNavigate();
  const { id } = useParams(); // present only in edit mode

  const isEdit = mode === "edit";

  const [type, setType] = useState(typeProp);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);

  // ── All form fields (controlled) ────────────────────────────────────────────
  const [fields, setFields] = useState({
    lastName: "", firstName: "", middleName: "", suffix: "",
    birthday: "", age: "", sex: "", birthPlace: "", contact: "",
    religion: "", philHealth: "", memberName: "", address: "",
    // child
    fatherName: "", motherName: "", placeDelivered: "", placeDeliveredOther: "",
    deliveryType: "", birthLength: "", birthWeight: "", attendantBirth: "",
    // adult
    civilStatus: "", maidenName: "", memberBirthday: "", familyMember: "",
    bloodType: "", spouseName: "", education: "",
    menarche: "", lmp: "", gravidity: "", edc: "", parity: "",
    fullterm: "", preterm: "", abortion: "", livebirth: "",
  });
  const [immunization, setImmunization] = useState({});
  const [records, setRecords] = useState([makeEmptyRecord(1)]);

  function setField(name, value) {
    setFields(prev => ({ ...prev, [name]: value }));
  }

  function handleLogout() { logout(); navigate("/"); }

  // ── Load existing patient data when editing ─────────────────────────────────
  useEffect(() => {
    if (!isEdit || !id) return;
    (async () => {
      setLoading(true);
      try {
        const snap = await getDoc(doc(db, "patients", id));
        if (!snap.exists()) {
          alert("Patient record not found.");
          navigate("/midwife/patients");
          return;
        }
        const data = snap.data();
        setType(data.type || "child");
        setFields(prev => ({ ...prev, ...data }));
        setImmunization(data.immunization || {});
        if (Array.isArray(data.clinicalRecords) && data.clinicalRecords.length > 0) {
          setRecords(data.clinicalRecords.map((r, i) => ({ ...makeEmptyRecord(i + 1), ...r, id: i + 1 })));
        }
      } catch (err) {
        alert("Error loading patient: " + err.message);
      }
      setLoading(false);
    })();
  }, [isEdit, id]);

  function updateRecord(rid, field, value) {
    setRecords(prev => prev.map(r => r.id === rid ? { ...r, [field]: value } : r));
  }
  function addRecord() {
    setRecords(prev => [...prev, makeEmptyRecord(Date.now())]);
  }
  function removeRecord(rid) {
    if (records.length > 1) setRecords(prev => prev.filter(r => r.id !== rid));
  }
  function updateImmunization(vaccine, value) {
    setImmunization(prev => ({ ...prev, [vaccine]: value }));
  }

  const fullName = `${fields.lastName}, ${fields.firstName} ${fields.middleName}`.trim();

  const requiredVaccines = ["BCG", "HEPA B W/IN 24 HOURS", "PENTAVALENT 1", "PENTAVALENT 2",
    "PENTAVALENT 3", "OPV 1", "OPV 2", "OPV 3", "MCV 1 (AMV)"];
  const immunizationStatus = requiredVaccines.every(v => immunization[v])
    ? "Complete" : "Incomplete";

  async function handleSave() {
    if (!fields.lastName.trim() || !fields.firstName.trim()) {
      alert("Please enter at least the patient's Last Name and First Name.");
      return;
    }
    setSaving(true);
    try {
      const patientData = {
        ...fields,
        type,
        name: fullName,
        age: parseInt(fields.age) || 0,
        barangayName: userData?.barangayName ?? "",
        clinicalRecords: records.map(r => ({ ...r, id: undefined })),
        ...(type === "child" && { immunization, immunizationStatus }),
      };

      if (isEdit) {
        await updateDoc(doc(db, "patients", id), {
          ...patientData,
          updatedAt: serverTimestamp(),
        });
        alert("Patient record updated successfully!");
      } else {
        await addDoc(collection(db, "patients"), {
          ...patientData,
          patientId: generatePatientId(),
          createdBy: user?.uid ?? "",
          createdAt: serverTimestamp(),
          lastVisit: new Date().toLocaleDateString(),
          status: "active",
        });
        alert("Patient record saved successfully!");
      }
      navigate("/midwife/patients");
    } catch (error) {
      alert("Error saving: " + error.message);
    }
    setSaving(false);
  }

  function handleCancel() { navigate("/midwife/patients"); }

  const TA = {
    display: "block", width: "100%", minHeight: "140px", height: "140px",
    border: "1px solid #d1d5db", borderRadius: "6px", padding: "8px",
    fontSize: "13px", color: "#374151", background: "#fff",
    resize: "vertical", boxSizing: "border-box",
    fontFamily: "DM Sans, sans-serif", outline: "none",
  };

  const CHILD_VITALS = [
    ["bp","BP"],["hr","HR"],["rr","RR"],["wt","WT"],["ht","HT"],["temp","TEMP"],
    ["headCircum","Head Circum"],["armCircum","Arm Circum"],["armLength","Arm Length"],
    ["waistCircum","Waist Circum"],["skinFold","SkinFold Thickness"],["limbLength","Limb Length"]
  ];
  const ADULT_VITALS = [["bp","BP"],["hr","HR"],["rr","RR"],["wt","WT"],["ht","HT"],["temp","TEMP"]];

  if (loading) {
    return (
      <div className="midwife-layout">
        <div className="midwife-main" style={{ alignItems: "center", justifyContent: "center", display: "flex" }}>
          <p>Loading patient record...</p>
        </div>
      </div>
    );
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
              {isEdit ? "Edit" : "Add New"} {type === "child" ? "Child" : "Adult"} Patient Record
            </h1>
            <button className="ap-print-btn" onClick={() => window.print()}>Print</button>
          </div>

          {/* ── PATIENT INFO ── */}
          <div className="ap-info-card">
            {type === "child"
              ? <ChildInfo fields={fields} setField={setField} immunization={immunization} updateImmunization={updateImmunization} />
              : <AdultInfo fields={fields} setField={setField} />}
          </div>

          {/* ── CLINICAL RECORDS ── */}
          {records.map((rec) => (
            <div key={rec.id} className="ap-clinical-card">
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
                        value={rec.date}
                        onChange={e => updateRecord(rec.id, "date", e.target.value)} />
                    </td>
                    <td className="ap-td-vitals">
                      {(type === "child" ? CHILD_VITALS : ADULT_VITALS).map(([field, label]) => (
                        <div key={field} className="ap-vital-row">
                          <span>{label}:</span>
                          <input type="text"
                            value={rec[field] || ""}
                            onChange={e => updateRecord(rec.id, field, e.target.value)} />
                        </div>
                      ))}
                    </td>
                    <td className="ap-td-text">
                      <textarea style={TA} placeholder="Enter chief complaints..."
                        value={rec.complaints}
                        onChange={e => updateRecord(rec.id, "complaints", e.target.value)} />
                    </td>
                    <td className="ap-td-text">
                      <textarea style={TA} placeholder="Enter diagnosis..."
                        value={rec.diagnosis}
                        onChange={e => updateRecord(rec.id, "diagnosis", e.target.value)} />
                    </td>
                    <td className="ap-td-text">
                      <textarea style={TA} placeholder="Enter medications / treatment..."
                        value={rec.medications}
                        onChange={e => updateRecord(rec.id, "medications", e.target.value)} />
                    </td>
                  </tr>
                </tbody>
              </table>
              {records.length > 1 && (
                <div className="ap-remove-wrap">
                  <button className="ap-remove-btn" onClick={() => removeRecord(rec.id)}>Remove</button>
                </div>
              )}
            </div>
          ))}

          {/* ── BOTTOM ACTIONS ── */}
          <div className="ap-bottom">
            <button className="ap-add-btn" onClick={addRecord}>+ Add Another Record</button>
            <div className="ap-bottom-right">
              <button className="ap-cancel-btn" onClick={handleCancel}>Cancel</button>
              <button className="ap-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : isEdit ? "Update Record" : "Save Record"}
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── CHILD INFO ── */
function ChildInfo({ fields, setField, immunization, updateImmunization }) {
  const f = fields;
  return (
    <div className="ap-info-grid">
      <div className="ap-info-col">
        <div className="ap-row"><span>Last Name:</span>
          <input type="text" value={f.lastName} onChange={e => setField("lastName", e.target.value)} /></div>
        <div className="ap-row">
          <span>First Name:</span>
          <input type="text" className="ap-flex2" value={f.firstName} onChange={e => setField("firstName", e.target.value)} />
          <span className="ap-span-sm">Suffix:</span>
          <input type="text" className="ap-w80" value={f.suffix} onChange={e => setField("suffix", e.target.value)} />
        </div>
        <div className="ap-row"><span>Middle Name:</span>
          <input type="text" value={f.middleName} onChange={e => setField("middleName", e.target.value)} /></div>
        <div className="ap-row"><span>Father's Name:</span>
          <input type="text" value={f.fatherName} onChange={e => setField("fatherName", e.target.value)} /></div>
        <div className="ap-row"><span>Mother's Name:</span>
          <input type="text" value={f.motherName} onChange={e => setField("motherName", e.target.value)} /></div>
        <div className="ap-row"><span>Contact Number:</span>
          <input type="text" value={f.contact} onChange={e => setField("contact", e.target.value)} /></div>
        <div className="ap-row"><span>Religion:</span>
          <input type="text" value={f.religion} onChange={e => setField("religion", e.target.value)} /></div>
        <div className="ap-row"><span>PhilHealth:</span>
          <input type="text" value={f.philHealth} onChange={e => setField("philHealth", e.target.value)} /></div>
        <div className="ap-row">
          <span>Member's Name:</span>
          <input type="text" placeholder="Last Name, First Name, Middle Name"
            value={f.memberName} onChange={e => setField("memberName", e.target.value)} />
        </div>
      </div>
      <div className="ap-info-col">
        <div className="ap-row">
          <span>Birthday:</span><input type="date" className="ap-w130" value={f.birthday} onChange={e => setField("birthday", e.target.value)} />
          <span className="ap-span-sm">Age:</span><input type="number" className="ap-w60" value={f.age} onChange={e => setField("age", e.target.value)} />
          <span className="ap-span-sm">Sex:</span><input type="text" className="ap-w60" value={f.sex} onChange={e => setField("sex", e.target.value)} />
        </div>
        <div className="ap-row"><span>BirthPlace:</span>
          <input type="text" value={f.birthPlace} onChange={e => setField("birthPlace", e.target.value)} /></div>
        <div className="ap-row">
          <span>Place Delivered:</span>
          {["Lying In","Hospital","Others"].map(opt => (
            <label key={opt} className="ap-cb">
              <input type="checkbox" checked={f.placeDelivered === opt}
                onChange={() => setField("placeDelivered", opt)} />{opt}
            </label>
          ))}
        </div>
        <div className="ap-row">
          <span>Type of Delivery:</span>
          {["NSD","CS"].map(opt => (
            <label key={opt} className="ap-cb">
              <input type="checkbox" checked={f.deliveryType === opt}
                onChange={() => setField("deliveryType", opt)} />{opt}
            </label>
          ))}
        </div>
        <div className="ap-row"><span>Birth Length:</span>
          <input type="text" className="ap-w120" value={f.birthLength} onChange={e => setField("birthLength", e.target.value)} /></div>
        <div className="ap-row"><span>Birth Weight:</span>
          <input type="text" className="ap-w120" value={f.birthWeight} onChange={e => setField("birthWeight", e.target.value)} /></div>
        <div className="ap-row"><span>Attendant at Birth:</span>
          <input type="text" value={f.attendantBirth} onChange={e => setField("attendantBirth", e.target.value)} /></div>
        <div className="ap-row"><span>Complete Address:</span>
          <input type="text" value={f.address} onChange={e => setField("address", e.target.value)} /></div>
      </div>

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
                  <input type="date" value={immunization[v] || ""}
                    onChange={e => updateImmunization(v, e.target.value)} />
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
function AdultInfo({ fields, setField }) {
  const f = fields;
  return (
    <div className="ap-info-grid">
      <div className="ap-info-col">
        <div className="ap-row"><span>Last Name:</span>
          <input type="text" value={f.lastName} onChange={e => setField("lastName", e.target.value)} /></div>
        <div className="ap-row">
          <span>First Name:</span>
          <input type="text" className="ap-flex2" value={f.firstName} onChange={e => setField("firstName", e.target.value)} />
          <span className="ap-span-sm">Suffix:</span>
          <input type="text" className="ap-w80" value={f.suffix} onChange={e => setField("suffix", e.target.value)} />
        </div>
        <div className="ap-row"><span>Middle Name:</span>
          <input type="text" value={f.middleName} onChange={e => setField("middleName", e.target.value)} /></div>
        <div className="ap-row"><span>Civil Status:</span>
          <input type="text" value={f.civilStatus} onChange={e => setField("civilStatus", e.target.value)} /></div>
        <div className="ap-row">
          <span>Maiden Name:</span>
          <input type="text" placeholder="For Married Women" value={f.maidenName} onChange={e => setField("maidenName", e.target.value)} />
        </div>
        <div className="ap-row"><span>PhilHealth #:</span>
          <input type="text" value={f.philHealth} onChange={e => setField("philHealth", e.target.value)} /></div>
        <div className="ap-row">
          <span>Name:</span>
          <input type="text" placeholder="Last Name, First Name, Middle Name"
            value={f.memberName} onChange={e => setField("memberName", e.target.value)} />
        </div>
        <div className="ap-row"><span>Member's Birthday:</span>
          <input type="date" value={f.memberBirthday} onChange={e => setField("memberBirthday", e.target.value)} /></div>
        <div className="ap-row">
          <span>Family Member:</span>
          {["Head","Spouse","Child","Others"].map(opt => (
            <label key={opt} className="ap-cb">
              <input type="checkbox" checked={f.familyMember === opt}
                onChange={() => setField("familyMember", opt)} />{opt}
            </label>
          ))}
        </div>
      </div>
      <div className="ap-info-col">
        <div className="ap-row">
          <span>Birthday:</span><input type="date" className="ap-w130" value={f.birthday} onChange={e => setField("birthday", e.target.value)} />
          <span className="ap-span-sm">Age:</span><input type="number" className="ap-w60" value={f.age} onChange={e => setField("age", e.target.value)} />
          <span className="ap-span-sm">Sex:</span><input type="text" className="ap-w60" value={f.sex} onChange={e => setField("sex", e.target.value)} />
        </div>
        <div className="ap-row"><span>BirthPlace:</span>
          <input type="text" value={f.birthPlace} onChange={e => setField("birthPlace", e.target.value)} /></div>
        <div className="ap-row"><span>Blood Type:</span>
          <input type="text" value={f.bloodType} onChange={e => setField("bloodType", e.target.value)} /></div>
        <div className="ap-row"><span>Father's Name:</span>
          <input type="text" value={f.fatherName} onChange={e => setField("fatherName", e.target.value)} /></div>
        <div className="ap-row"><span>Mother's Name:</span>
          <input type="text" value={f.motherName} onChange={e => setField("motherName", e.target.value)} /></div>
        <div className="ap-row"><span>Contact Number:</span>
          <input type="text" value={f.contact} onChange={e => setField("contact", e.target.value)} /></div>
        <div className="ap-row"><span>Religion:</span>
          <input type="text" value={f.religion} onChange={e => setField("religion", e.target.value)} /></div>
        <div className="ap-row"><span>Name of Spouse:</span>
          <input type="text" value={f.spouseName} onChange={e => setField("spouseName", e.target.value)} /></div>
        <div className="ap-row"><span>Complete Address:</span>
          <input type="text" value={f.address} onChange={e => setField("address", e.target.value)} /></div>
        <div className="ap-row"><span>Educational Attainment:</span>
          <input type="text" value={f.education} onChange={e => setField("education", e.target.value)} /></div>
      </div>

      <div className="ap-female-section">
        <p className="ap-female-title">For Female Patient Only:</p>
        <div className="ap-female-grid">
          <div className="ap-row"><span>Age of Menarche Started:</span>
            <input type="text" value={f.menarche} onChange={e => setField("menarche", e.target.value)} /></div>
          <div className="ap-row"><span>LMP:</span>
            <input type="text" value={f.lmp} onChange={e => setField("lmp", e.target.value)} /></div>
          <div className="ap-row"><span>Gravidity:</span>
            <input type="text" value={f.gravidity} onChange={e => setField("gravidity", e.target.value)} /></div>
          <div className="ap-row"><span>EDC (If Pregnant):</span>
            <input type="text" value={f.edc} onChange={e => setField("edc", e.target.value)} /></div>
          <div className="ap-row"><span>Parity:</span>
            <input type="text" value={f.parity} onChange={e => setField("parity", e.target.value)} /></div>
        </div>
        <div className="ap-parity-row">
          {[["Full Term","fullterm"],["Preterm","preterm"],["Abortion","abortion"],["Livebirth","livebirth"]].map(([label, key]) => (
            <div key={key} className="ap-parity-item">
              <label>{label}</label>
              <input type="text" value={f[key]} onChange={e => setField(key, e.target.value)} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}