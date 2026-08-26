import { useState, useEffect } from "react";
import {
  collection, addDoc, updateDoc, doc, getDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useNavigate, useParams, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import { useToast } from "../../context/ToastContext";
import "./MidwifeAddPatient.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
  { label: "Messages",      to: "/midwife/messages"      },
  { label: "Notifications", to: "/midwife/notifications" },
];

function generatePatientId() {
  return "PT-" + Math.floor(10000 + Math.random() * 89999);
}

function emptyRecord(id) {
  return {
    id, date: "", bp: "", hr: "", rr: "", wt: "", ht: "", temp: "",
    headCircum: "", armCircum: "", armLength: "", waistCircum: "",
    skinFold: "", limbLength: "",
    complaints: "", diagnosis: "", medications: ""
  };
}

const EMPTY_FIELDS = {
  lastName: "", firstName: "", middleName: "", suffix: "",
  birthday: "", age: "", sex: "", birthPlace: "", contact: "",
  religion: "", philHealth: "", memberName: "", address: "",
  fatherName: "", motherName: "", placeDelivered: "", placeDeliveredOther: "",
  deliveryType: "", birthLength: "", birthWeight: "", attendantBirth: "",
  civilStatus: "", maidenName: "", memberBirthday: "", familyMember: "",
  bloodType: "", spouseName: "", education: "",
  menarche: "", lmp: "", gravidity: "", edc: "", parity: "",
  fullterm: "", preterm: "", abortion: "", livebirth: "",
};

export default function MidwifeAddPatient(props) {
  const typeProp = props.type || "child";
  const mode = props.mode || "add";
  const isEdit = mode === "edit";

  const { logout, user, userData } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const patientId = params.id;
  const unreadCount = useUnreadCount();

  const [type, setType] = useState(typeProp);
  const [pageLoading, setPageLoading] = useState(isEdit ? true : false);
  const [saving, setSaving] = useState(false);

  const [fields, setFields] = useState(EMPTY_FIELDS);
  const [immunization, setImmunization] = useState({});
  const [records, setRecords] = useState([emptyRecord(1)]);

  function setField(name, value) {
    setFields(function (prev) {
      const next = Object.assign({}, prev);
      next[name] = value;
      return next;
    });
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  function handleCancel() {
    navigate("/midwife/patients");
  }

  function addRecord() {
    setRecords(function (prev) {
      return prev.concat([emptyRecord(Date.now())]);
    });
  }

  function removeRecord(rid) {
    setRecords(function (prev) {
      if (prev.length <= 1) return prev;
      return prev.filter(function (r) { return r.id !== rid; });
    });
  }

  function updateRecord(rid, field, value) {
    setRecords(function (prev) {
      return prev.map(function (r) {
        if (r.id !== rid) return r;
        const updated = Object.assign({}, r);
        updated[field] = value;
        return updated;
      });
    });
  }

  function updateImmunization(vaccine, value) {
    setImmunization(function (prev) {
      const next = Object.assign({}, prev);
      next[vaccine] = value;
      return next;
    });
  }

  useEffect(function () {
    if (!isEdit || !patientId) return;

    let cancelled = false;

    async function loadPatient() {
      setPageLoading(true);
      try {
        const ref = doc(db, "patients", patientId);
        const snap = await getDoc(ref);
        if (cancelled) return;

        if (!snap.exists()) {
          showToast("Patient record not found.", "error");
          navigate("/midwife/patients");
          return;
        }

        const data = snap.data();
        setType(data.type === "adult" ? "adult" : "child");

        const loadedFields = Object.assign({}, EMPTY_FIELDS);
        Object.keys(EMPTY_FIELDS).forEach(function (key) {
          if (data[key] !== undefined) loadedFields[key] = data[key];
        });
        setFields(loadedFields);

        setImmunization(data.immunization || {});

        if (Array.isArray(data.clinicalRecords) && data.clinicalRecords.length > 0) {
          const loadedRecords = data.clinicalRecords.map(function (r, i) {
            return Object.assign(emptyRecord(i + 1), r, { id: i + 1 });
          });
          setRecords(loadedRecords);
        } else {
          setRecords([emptyRecord(1)]);
        }
      } catch (err) {
        showToast("Error loading patient: " + err.message, "error");
      } finally {
        if (!cancelled) setPageLoading(false);
      }
    }

    loadPatient();
    return function () { cancelled = true; };
  }, [isEdit, patientId, navigate]);

  const fullName = (fields.lastName + ", " + fields.firstName + " " + fields.middleName).trim();

  const requiredVaccines = [
    "BCG", "HEPA B W/IN 24 HOURS", "PENTAVALENT 1", "PENTAVALENT 2",
    "PENTAVALENT 3", "OPV 1", "OPV 2", "OPV 3", "MCV 1 (AMV)"
  ];
  const allRequiredGiven = requiredVaccines.every(function (v) { return !!immunization[v]; });
  const immunizationStatus = allRequiredGiven ? "Complete" : "Incomplete";

  async function handleSave() {
    if (!fields.lastName.trim() || !fields.firstName.trim()) {
      showToast("Please enter at least the patient's Last Name and First Name.", "error");
      return;
    }
    setSaving(true);
    try {
      const cleanRecords = records.map(function (r) {
        const copy = Object.assign({}, r);
        delete copy.id;
        return copy;
      });

      const basePayload = Object.assign({}, fields, {
        type: type,
        name: fullName,
        age: parseInt(fields.age, 10) || 0,
        barangayName: (userData && userData.barangayName) || "",
        clinicalRecords: cleanRecords,
      });

      if (type === "child") {
        basePayload.immunization = immunization;
        basePayload.immunizationStatus = immunizationStatus;
      }

      if (isEdit) {
        basePayload.updatedAt = serverTimestamp();
        await updateDoc(doc(db, "patients", patientId), basePayload);
        showToast("Patient record updated successfully!", "success");
      } else {
        basePayload.patientId = generatePatientId();
        basePayload.createdBy = (user && user.uid) || "";
        basePayload.createdAt = serverTimestamp();
        basePayload.lastVisit = new Date().toLocaleDateString();
        basePayload.status = "active";
        await addDoc(collection(db, "patients"), basePayload);
        showToast("Patient record saved successfully!", "success");
      }

      navigate("/midwife/patients");
    } catch (error) {
      showToast("Error saving: " + error.message, "error");
    }
    setSaving(false);
  }

  const childVitals = [
    ["bp", "BP"], ["hr", "HR"], ["rr", "RR"], ["wt", "WT (kg)"], ["ht", "HT (cm)"], ["temp", "TEMP (°C)"],
    ["headCircum", "Head Circum"], ["armCircum", "Arm Circum"], ["armLength", "Arm Length"],
    ["waistCircum", "Waist Circum"], ["skinFold", "SkinFold Thickness"], ["limbLength", "Limb Length"]
  ];
  const adultVitals = [
    ["bp", "BP"], ["hr", "HR"], ["rr", "RR"], ["wt", "WT (kg)"], ["ht", "HT (cm)"], ["temp", "TEMP (°C)"]
  ];
  const vitalsList = type === "child" ? childVitals : adultVitals;

  if (pageLoading) {
    return (
      <div className="midwife-layout">
        <div className="ap-loading-container">
          <div className="ap-spinner"></div>
          <p>Loading patient record...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="midwife-layout">
      {/* ── Sidebar Navigation ── */}
      <aside className="midwife-sidebar no-print">
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
          {navItems.map(function (item) {
            return (
              <NavLink 
                key={item.to} 
                to={item.to}
                className={function (navInfo) { return "midwife-nav-item" + (navInfo.isActive ? " active" : ""); }}
              >
                <span>{item.label}</span>
                {item.label === "Notifications" && unreadCount > 0 && (
                  <span className="nav-badge">{unreadCount}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        <div className="midwife-sidebar-footer">
          <button className="midwife-nav-item midwife-nav-btn" onClick={function() { navigate("/midwife/settings"); }}>
            Settings
          </button>
          <button className="midwife-nav-item midwife-nav-btn midwife-signout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* ── Main View Container ── */}
      <div className="midwife-main">
        <header className="midwife-topbar no-print">
          <div className="ap-topbar-left">
            <button className="ap-back-btn" onClick={handleCancel}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                <line x1="19" y1="12" x2="5" y2="12" />
                <polyline points="12 19 5 12 12 5" />
              </svg>
              Back
            </button>
            <span className="ap-topbar-tag">{type === "child" ? "Child Patient" : "Adult Patient"}</span>
          </div>

          <div className="midwife-topbar-right">
            <div className="midwife-user">
              <div className="midwife-user-info">
                <span className="midwife-user-name">{(userData && userData.username) || "Maria Santos"}</span>
                <span className="midwife-user-role">Registered Midwife</span>
              </div>
              <div className="midwife-avatar">
                {((userData && userData.username) ? userData.username.substring(0, 2) : "MS").toUpperCase()}
              </div>
            </div>
          </div>
        </header>

        <main className="midwife-content">
          <div className="ap-page-header no-print">
            <div>
              <h1 className="ap-page-title">
                {isEdit ? "Edit" : "New"} {type === "child" ? "Child Health" : "Adult Health"} Record
              </h1>
              <p className="ap-page-subtitle">
                Fill in the details below to register or update the patient's record in the station register.
              </p>
            </div>
            <div className="ap-header-actions">
              <button className="ap-print-btn" onClick={function () { window.print(); }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                Print Record
              </button>
            </div>
          </div>

          {/* Print Wrapper Canvas */}
          <div id="printable-record-sheet">
            {/* Patient Details Form Section */}
            <div className="ap-section-container">
              <div className="ap-section-title-bar">
                <span className="ap-section-icon"></span>
                <h2 className="ap-section-title">Patient Demographic Information</h2>
              </div>
              <div className="ap-info-card">
                {type === "child" ? (
                  <ChildInfo fields={fields} setField={setField} immunization={immunization} updateImmunization={updateImmunization} />
                ) : (
                  <AdultInfo fields={fields} setField={setField} />
                )}
              </div>
            </div>

            {/* Clinical History & Visit Log Section */}
            <div className="ap-section-container">
              <div className="ap-section-title-bar">
                <span className="ap-section-icon"></span>
                <h2 className="ap-section-title">Clinical History & Visit Consultations</h2>
              </div>
              <ClinicalRecordsSection
                records={records}
                vitalsList={vitalsList}
                onUpdateRecord={updateRecord}
                onRemoveRecord={removeRecord}
              />
            </div>
          </div>

          {/* Form Actions Footer */}
          <div className="ap-bottom no-print">
            <button className="ap-add-btn" onClick={addRecord}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" width="16" height="16">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Add Consultation Entry
            </button>
            <div className="ap-bottom-right">
              <button className="ap-cancel-btn" onClick={handleCancel}>Cancel</button>
              <button className="ap-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? "Saving Record..." : (isEdit ? "Update Patient Record" : "Save Patient Record")}
              </button>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

/* ── Clinical Records Section ───────────────────────────────────────── */
function ClinicalRecordsSection(props) {
  const records = props.records;
  const vitalsList = props.vitalsList;
  const onUpdateRecord = props.onUpdateRecord;
  const onRemoveRecord = props.onRemoveRecord;

  if (!records || records.length === 0) {
    return (
      <div className="ap-clinical-card ap-empty-clinical">
        <p>No consultation records logged yet.</p>
      </div>
    );
  }

  return (
    <div className="ap-clinical-records-list">
      {records.map(function (rec, index) {
        const isDateEmpty = !rec.date;
        const isComplaintsEmpty = !rec.complaints || rec.complaints.trim() === "";
        const isDiagnosisEmpty = !rec.diagnosis || rec.diagnosis.trim() === "";
        const isMedicationsEmpty = !rec.medications || rec.medications.trim() === "";

        return (
          <div key={rec.id} className="ap-clinical-card">
            <div className="ap-clinical-card-header">
              <span className="ap-record-badge">Consultation #{index + 1}</span>
              {records.length > 1 && (
                <button className="ap-remove-btn no-print" onClick={function () { onRemoveRecord(rec.id); }}>
                  Remove Entry
                </button>
              )}
            </div>
            
            <div className="ap-table-wrapper">
              <table className="ap-clinical-table">
                <thead>
                  <tr>
                    <th className="ap-th-date">VISIT DATE</th>
                    <th className="ap-th-vitals">VITAL SIGNS</th>
                    <th>CHIEF COMPLAINTS</th>
                    <th>DIAGNOSIS</th>
                    <th>MEDICATIONS / TREATMENT</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={"ap-td-date" + (isDateEmpty ? " print-empty-cell" : "")}>
                      <input
                        type="date"
                        className="ap-date-input"
                        value={rec.date}
                        onChange={function (e) { onUpdateRecord(rec.id, "date", e.target.value); }}
                      />
                    </td>
                    <td className="ap-td-vitals">
                      <div className="ap-vitals-grid">
                        {vitalsList.map(function (pair) {
                          const field = pair[0];
                          const label = pair[1];
                          return (
                            <div key={field} className="ap-vital-row">
                              <span className="ap-vital-label">{label}:</span>
                              <input
                                type="text"
                                className="ap-vital-input"
                                value={rec[field] || ""}
                                onChange={function (e) { onUpdateRecord(rec.id, field, e.target.value); }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td className={"ap-td-text" + (isComplaintsEmpty ? " print-empty-cell" : "")}>
                      <textarea
                        className="ap-textarea"
                        placeholder="Enter chief complaints..."
                        value={rec.complaints}
                        onChange={function (e) { onUpdateRecord(rec.id, "complaints", e.target.value); }}
                      />
                    </td>
                    <td className={"ap-td-text" + (isDiagnosisEmpty ? " print-empty-cell" : "")}>
                      <textarea
                        className="ap-textarea"
                        placeholder="Enter diagnosis..."
                        value={rec.diagnosis}
                        onChange={function (e) { onUpdateRecord(rec.id, "diagnosis", e.target.value); }}
                      />
                    </td>
                    <td className={"ap-td-text" + (isMedicationsEmpty ? " print-empty-cell" : "")}>
                      <textarea
                        className="ap-textarea"
                        placeholder="Enter prescribed medications / instructions..."
                        value={rec.medications}
                        onChange={function (e) { onUpdateRecord(rec.id, "medications", e.target.value); }}
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── CHILD INFO COMPONENT ───────────────────────────────────────────── */
function ChildInfo(props) {
  const f = props.fields;
  const setField = props.setField;
  const immunization = props.immunization;
  const updateImmunization = props.updateImmunization;

  return (
    <div className="ap-info-grid">
      <div className="ap-info-col">
        <div className="ap-row">
          <span>Last Name:</span>
          <input type="text" value={f.lastName} onChange={function (e) { setField("lastName", e.target.value); }} placeholder="e.g. Dela Cruz" />
        </div>
        <div className="ap-row">
          <span>First Name:</span>
          <input type="text" className="ap-flex2" value={f.firstName} onChange={function (e) { setField("firstName", e.target.value); }} placeholder="e.g. Juan" />
          <span className="ap-span-sm">Suffix:</span>
          <input type="text" className="ap-w80" value={f.suffix} onChange={function (e) { setField("suffix", e.target.value); }} placeholder="Jr., III" />
        </div>
        <div className="ap-row">
          <span>Middle Name:</span>
          <input type="text" value={f.middleName} onChange={function (e) { setField("middleName", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Father's Name:</span>
          <input type="text" value={f.fatherName} onChange={function (e) { setField("fatherName", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Mother's Name:</span>
          <input type="text" value={f.motherName} onChange={function (e) { setField("motherName", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Contact Number:</span>
          <input type="text" value={f.contact} onChange={function (e) { setField("contact", e.target.value); }} placeholder="09xxxxxxxxx" />
        </div>
        <div className="ap-row">
          <span>Religion:</span>
          <input type="text" value={f.religion} onChange={function (e) { setField("religion", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>PhilHealth #:</span>
          <input type="text" value={f.philHealth} onChange={function (e) { setField("philHealth", e.target.value); }} placeholder="xx-xxxxxxxxx-x" />
        </div>
        <div className="ap-row">
          <span>Member's Name:</span>
          <input type="text" placeholder="Last Name, First Name, Middle Name"
            value={f.memberName} onChange={function (e) { setField("memberName", e.target.value); }} />
        </div>
      </div>

      <div className="ap-info-col">
        <div className={"ap-row" + (!f.birthday ? " print-empty-field" : "")}>
          <span>Birthday:</span>
          <input type="date" className="ap-w130" value={f.birthday} onChange={function (e) { setField("birthday", e.target.value); }} />
          <span className="ap-span-sm">Age:</span>
          <input type="number" className="ap-w60" value={f.age} onChange={function (e) { setField("age", e.target.value); }} />
          <span className="ap-span-sm">Sex:</span>
          <input type="text" className="ap-w60" value={f.sex} onChange={function (e) { setField("sex", e.target.value); }} placeholder="M/F" />
        </div>
        <div className="ap-row">
          <span>Birthplace:</span>
          <input type="text" value={f.birthPlace} onChange={function (e) { setField("birthPlace", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Place Delivered:</span>
          <div className="ap-cb-group">
            {["Lying In", "Hospital", "Others"].map(function (opt) {
              return (
                <label key={opt} className="ap-cb">
                  <input type="checkbox" checked={f.placeDelivered === opt}
                    onChange={function () { setField("placeDelivered", opt); }} />
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
        <div className="ap-row">
          <span>Type of Delivery:</span>
          <div className="ap-cb-group">
            {["NSD", "CS"].map(function (opt) {
              return (
                <label key={opt} className="ap-cb">
                  <input type="checkbox" checked={f.deliveryType === opt}
                    onChange={function () { setField("deliveryType", opt); }} />
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
        <div className="ap-row">
          <span>Birth Length (cm):</span>
          <input type="text" className="ap-w120" value={f.birthLength} onChange={function (e) { setField("birthLength", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Birth Weight (kg):</span>
          <input type="text" className="ap-w120" value={f.birthWeight} onChange={function (e) { setField("birthWeight", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Attendant at Birth:</span>
          <input type="text" value={f.attendantBirth} onChange={function (e) { setField("attendantBirth", e.target.value); }} placeholder="Doctor / Midwife / Nurse" />
        </div>
        <div className="ap-row">
          <span>Complete Address:</span>
          <input type="text" value={f.address} onChange={function (e) { setField("address", e.target.value); }} placeholder="House No., Street, Barangay" />
        </div>
      </div>

      {/* Child Immunization Record Matrix */}
      <div className="ap-immun-section">
        <div className="ap-immun-title">Target Client List for Immunization (TCL)</div>
        <div className="ap-immun-header">
          <div>IMMUNIZATION</div><div>DATE GIVEN</div>
          <div>IMMUNIZATION</div><div>DATE GIVEN</div>
          <div>IMMUNIZATION</div><div>DATE GIVEN</div>
        </div>
        <div className="ap-immun-body">
          {[
            ["BCG", "HEPA B W/IN 24 HOURS", "HEPA B >= 24 HOURS", "PENTAVALENT 1", "PENTAVALENT 2", "PENTAVALENT 3", "MCV 1 (AMV)", "MCV 2 (MMR)"],
            ["OPV 1", "OPV 2", "OPV 3", "ROTA 1", "ROTA 2", "PCV 1", "PCV 2", "PCV 3"],
            ["IPV 1", "IPV 2", "HEPA A", "PNEUMONIA", "INFLUENZA", "OTHERS", "NBST", "EBF"]
          ].map(function (col, ci) {
            return (
              <div key={ci} className="ap-immun-col">
                {col.map(function (v) {
                  const isValEmpty = !immunization[v];
                  return (
                    <div key={v} className={"ap-immun-row" + (isValEmpty ? " print-empty-field" : "")}>
                      <span>{v}:</span>
                      <input type="date" value={immunization[v] || ""}
                        onChange={function (e) { updateImmunization(v, e.target.value); }} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── ADULT INFO COMPONENT ───────────────────────────────────────────── */
function AdultInfo(props) {
  const f = props.fields;
  const setField = props.setField;

  return (
    <div className="ap-info-grid">
      <div className="ap-info-col">
        <div className="ap-row">
          <span>Last Name:</span>
          <input type="text" value={f.lastName} onChange={function (e) { setField("lastName", e.target.value); }} placeholder="e.g. Santos" />
        </div>
        <div className="ap-row">
          <span>First Name:</span>
          <input type="text" className="ap-flex2" value={f.firstName} onChange={function (e) { setField("firstName", e.target.value); }} placeholder="e.g. Maria" />
          <span className="ap-span-sm">Suffix:</span>
          <input type="text" className="ap-w80" value={f.suffix} onChange={function (e) { setField("suffix", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Middle Name:</span>
          <input type="text" value={f.middleName} onChange={function (e) { setField("middleName", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Civil Status:</span>
          <input type="text" value={f.civilStatus} onChange={function (e) { setField("civilStatus", e.target.value); }} placeholder="Single / Married / Widowed" />
        </div>
        <div className="ap-row">
          <span>Maiden Name:</span>
          <input type="text" placeholder="For Married Women" value={f.maidenName} onChange={function (e) { setField("maidenName", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>PhilHealth #:</span>
          <input type="text" value={f.philHealth} onChange={function (e) { setField("philHealth", e.target.value); }} placeholder="xx-xxxxxxxxx-x" />
        </div>
        <div className="ap-row">
          <span>Member's Name:</span>
          <input type="text" placeholder="Last Name, First Name, Middle Name"
            value={f.memberName} onChange={function (e) { setField("memberName", e.target.value); }} />
        </div>
        <div className={"ap-row" + (!f.memberBirthday ? " print-empty-field" : "")}>
          <span>Member's Birthday:</span>
          <input type="date" value={f.memberBirthday} onChange={function (e) { setField("memberBirthday", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Family Member:</span>
          <div className="ap-cb-group">
            {["Head", "Spouse", "Child", "Others"].map(function (opt) {
              return (
                <label key={opt} className="ap-cb">
                  <input type="checkbox" checked={f.familyMember === opt}
                    onChange={function () { setField("familyMember", opt); }} />
                  {opt}
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="ap-info-col">
        <div className={"ap-row" + (!f.birthday ? " print-empty-field" : "")}>
          <span>Birthday:</span>
          <input type="date" className="ap-w130" value={f.birthday} onChange={function (e) { setField("birthday", e.target.value); }} />
          <span className="ap-span-sm">Age:</span>
          <input type="number" className="ap-w60" value={f.age} onChange={function (e) { setField("age", e.target.value); }} />
          <span className="ap-span-sm">Sex:</span>
          <input type="text" className="ap-w60" value={f.sex} onChange={function (e) { setField("sex", e.target.value); }} placeholder="M/F" />
        </div>
        <div className="ap-row">
          <span>Birthplace:</span>
          <input type="text" value={f.birthPlace} onChange={function (e) { setField("birthPlace", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Blood Type:</span>
          <input type="text" value={f.bloodType} onChange={function (e) { setField("bloodType", e.target.value); }} placeholder="A+, O+, etc." />
        </div>
        <div className="ap-row">
          <span>Father's Name:</span>
          <input type="text" value={f.fatherName} onChange={function (e) { setField("fatherName", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Mother's Name:</span>
          <input type="text" value={f.motherName} onChange={function (e) { setField("motherName", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Contact Number:</span>
          <input type="text" value={f.contact} onChange={function (e) { setField("contact", e.target.value); }} placeholder="09xxxxxxxxx" />
        </div>
        <div className="ap-row">
          <span>Religion:</span>
          <input type="text" value={f.religion} onChange={function (e) { setField("religion", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Name of Spouse:</span>
          <input type="text" value={f.spouseName} onChange={function (e) { setField("spouseName", e.target.value); }} />
        </div>
        <div className="ap-row">
          <span>Complete Address:</span>
          <input type="text" value={f.address} onChange={function (e) { setField("address", e.target.value); }} placeholder="House No., Street, Barangay" />
        </div>
        <div className="ap-row">
          <span>Education:</span>
          <input type="text" value={f.education} onChange={function (e) { setField("education", e.target.value); }} placeholder="Highest Attainment" />
        </div>
      </div>

      {/* Maternal / Female Specific Section */}
      <div className="ap-female-section">
        <p className="ap-female-title">Maternal & Reproductive History (For Female Patients)</p>
        <div className="ap-female-grid">
          <div className="ap-row">
            <span>Age of Menarche:</span>
            <input type="text" value={f.menarche} onChange={function (e) { setField("menarche", e.target.value); }} placeholder="e.g. 12" />
          </div>
          <div className={"ap-row" + (!f.lmp ? " print-empty-field" : "")}>
            <span>LMP:</span>
            <input type="text" value={f.lmp} onChange={function (e) { setField("lmp", e.target.value); }} placeholder="Last Menstrual Period" />
          </div>
          <div className="ap-row">
            <span>Gravidity (G):</span>
            <input type="text" value={f.gravidity} onChange={function (e) { setField("gravidity", e.target.value); }} placeholder="Total pregnancies" />
          </div>
          <div className={"ap-row" + (!f.edc ? " print-empty-field" : "")}>
            <span>EDC (If Pregnant):</span>
            <input type="text" value={f.edc} onChange={function (e) { setField("edc", e.target.value); }} placeholder="Expected Date of Confinement" />
          </div>
          <div className="ap-row">
            <span>Parity (P):</span>
            <input type="text" value={f.parity} onChange={function (e) { setField("parity", e.target.value); }} placeholder="Number of deliveries" />
          </div>
        </div>
        <div className="ap-parity-row">
          {[["Full Term", "fullterm"], ["Preterm", "preterm"], ["Abortion", "abortion"], ["Livebirth", "livebirth"]].map(function (pair) {
            const label = pair[0];
            const key = pair[1];
            return (
              <div key={key} className="ap-parity-item">
                <label>{label}</label>
                <input type="text" value={f[key]} onChange={function (e) { setField(key, e.target.value); }} placeholder="0" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}