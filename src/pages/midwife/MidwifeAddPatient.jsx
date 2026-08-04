import { useState, useEffect } from "react";
import {
  collection, addDoc, updateDoc, doc, getDoc, serverTimestamp
} from "firebase/firestore";
import { db } from "../../firebase/config";
import { useNavigate, useParams, NavLink } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useUnreadCount } from "../../hooks/useUnreadCount";
import "./MidwifeAddPatient.css";

const navItems = [
  { label: "Dashboard",     to: "/midwife/dashboard"     },
  { label: "Patients",      to: "/midwife/patients"      },
  { label: "Inventory",     to: "/midwife/inventory"     },
  { label: "Dispense",      to: "/midwife/dispense"      },
  { label: "Reports",       to: "/midwife/reports"       },
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

  // Load existing patient when in edit mode
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
          alert("Patient record not found.");
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
        alert("Error loading patient: " + err.message);
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
      alert("Please enter at least the patient's Last Name and First Name.");
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
        alert("Patient record updated successfully!");
      } else {
        basePayload.patientId = generatePatientId();
        basePayload.createdBy = (user && user.uid) || "";
        basePayload.createdAt = serverTimestamp();
        basePayload.lastVisit = new Date().toLocaleDateString();
        basePayload.status = "active";
        await addDoc(collection(db, "patients"), basePayload);
        alert("Patient record saved successfully!");
      }

      navigate("/midwife/patients");
    } catch (error) {
      alert("Error saving: " + error.message);
    }
    setSaving(false);
  }

  const textareaStyle = {
    display: "block",
    width: "100%",
    minHeight: "140px",
    height: "140px",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    padding: "8px",
    fontSize: "13px",
    color: "#374151",
    background: "#fff",
    resize: "vertical",
    boxSizing: "border-box",
    fontFamily: "DM Sans, sans-serif",
    outline: "none",
  };

  const childVitals = [
    ["bp", "BP"], ["hr", "HR"], ["rr", "RR"], ["wt", "WT"], ["ht", "HT"], ["temp", "TEMP"],
    ["headCircum", "Head Circum"], ["armCircum", "Arm Circum"], ["armLength", "Arm Length"],
    ["waistCircum", "Waist Circum"], ["skinFold", "SkinFold Thickness"], ["limbLength", "Limb Length"]
  ];
  const adultVitals = [["bp", "BP"], ["hr", "HR"], ["rr", "RR"], ["wt", "WT"], ["ht", "HT"], ["temp", "TEMP"]];
  const vitalsList = type === "child" ? childVitals : adultVitals;

  if (pageLoading) {
    return (
      <div className="midwife-layout">
        <div className="midwife-main" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
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
          {navItems.map(function (item) {
            return (
              <NavLink key={item.to} to={item.to}
                className={function (navInfo) { return "midwife-nav-item" + (navInfo.isActive ? " active" : ""); }}>
                <span>{item.label}</span>
                {item.label === "Notifications" && unreadCount > 0 && (
                  <span className="nav-badge">{unreadCount}</span>
                )}
              </NavLink>
            );
          })}
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
          <input className="midwife-search" type="text" placeholder="Search patients, medicine, or ID..." />
          <div className="midwife-topbar-right">
            <div className="midwife-user">
              <div className="midwife-user-info">
                <span className="midwife-user-name">{(userData && userData.username) || "Maria Santos"}</span>
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
            <button className="ap-print-btn" onClick={function () { window.print(); }}>Print</button>
          </div>

          <div className="ap-info-card">
            {type === "child" ? (
              <ChildInfo fields={fields} setField={setField} immunization={immunization} updateImmunization={updateImmunization} />
            ) : (
              <AdultInfo fields={fields} setField={setField} />
            )}
          </div>

          <ClinicalRecordsSection
            records={records}
            vitalsList={vitalsList}
            textareaStyle={textareaStyle}
            onUpdateRecord={updateRecord}
            onRemoveRecord={removeRecord}
          />

          <div className="ap-bottom">
            <button className="ap-add-btn" onClick={addRecord}>+ Add Another Record</button>
            <div className="ap-bottom-right">
              <button className="ap-cancel-btn" onClick={handleCancel}>Cancel</button>
              <button className="ap-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : (isEdit ? "Update Record" : "Save Record")}
              </button>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}

/* ── Clinical Records Section (isolated component) ───────────────────────────── */
function ClinicalRecordsSection(props) {
  const records = props.records;
  const vitalsList = props.vitalsList;
  const textareaStyle = props.textareaStyle;
  const onUpdateRecord = props.onUpdateRecord;
  const onRemoveRecord = props.onRemoveRecord;

  if (!records || records.length === 0) {
    return (
      <div className="ap-clinical-card">
        <p style={{ padding: "1.5rem", color: "#9ca3af" }}>No clinical records yet.</p>
      </div>
    );
  }

  return (
    <div>
      {records.map(function (rec) {
        return (
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
                    <input
                      type="date"
                      className="ap-date-input"
                      value={rec.date}
                      onChange={function (e) { onUpdateRecord(rec.id, "date", e.target.value); }}
                    />
                  </td>
                  <td className="ap-td-vitals">
                    {vitalsList.map(function (pair) {
                      const field = pair[0];
                      const label = pair[1];
                      return (
                        <div key={field} className="ap-vital-row">
                          <span>{label}:</span>
                          <input
                            type="text"
                            value={rec[field] || ""}
                            onChange={function (e) { onUpdateRecord(rec.id, field, e.target.value); }}
                          />
                        </div>
                      );
                    })}
                  </td>
                  <td className="ap-td-text">
                    <textarea
                      style={textareaStyle}
                      placeholder="Enter chief complaints..."
                      value={rec.complaints}
                      onChange={function (e) { onUpdateRecord(rec.id, "complaints", e.target.value); }}
                    />
                  </td>
                  <td className="ap-td-text">
                    <textarea
                      style={textareaStyle}
                      placeholder="Enter diagnosis..."
                      value={rec.diagnosis}
                      onChange={function (e) { onUpdateRecord(rec.id, "diagnosis", e.target.value); }}
                    />
                  </td>
                  <td className="ap-td-text">
                    <textarea
                      style={textareaStyle}
                      placeholder="Enter medications / treatment..."
                      value={rec.medications}
                      onChange={function (e) { onUpdateRecord(rec.id, "medications", e.target.value); }}
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            {records.length > 1 && (
              <div className="ap-remove-wrap">
                <button className="ap-remove-btn" onClick={function () { onRemoveRecord(rec.id); }}>
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── CHILD INFO ────────────────────────────────────────────────────────────── */
function ChildInfo(props) {
  const f = props.fields;
  const setField = props.setField;
  const immunization = props.immunization;
  const updateImmunization = props.updateImmunization;

  return (
    <div className="ap-info-grid">
      <div className="ap-info-col">
        <div className="ap-row"><span>Last Name:</span>
          <input type="text" value={f.lastName} onChange={function (e) { setField("lastName", e.target.value); }} /></div>
        <div className="ap-row">
          <span>First Name:</span>
          <input type="text" className="ap-flex2" value={f.firstName} onChange={function (e) { setField("firstName", e.target.value); }} />
          <span className="ap-span-sm">Suffix:</span>
          <input type="text" className="ap-w80" value={f.suffix} onChange={function (e) { setField("suffix", e.target.value); }} />
        </div>
        <div className="ap-row"><span>Middle Name:</span>
          <input type="text" value={f.middleName} onChange={function (e) { setField("middleName", e.target.value); }} /></div>
        <div className="ap-row"><span>Father's Name:</span>
          <input type="text" value={f.fatherName} onChange={function (e) { setField("fatherName", e.target.value); }} /></div>
        <div className="ap-row"><span>Mother's Name:</span>
          <input type="text" value={f.motherName} onChange={function (e) { setField("motherName", e.target.value); }} /></div>
        <div className="ap-row"><span>Contact Number:</span>
          <input type="text" value={f.contact} onChange={function (e) { setField("contact", e.target.value); }} /></div>
        <div className="ap-row"><span>Religion:</span>
          <input type="text" value={f.religion} onChange={function (e) { setField("religion", e.target.value); }} /></div>
        <div className="ap-row"><span>PhilHealth:</span>
          <input type="text" value={f.philHealth} onChange={function (e) { setField("philHealth", e.target.value); }} /></div>
        <div className="ap-row">
          <span>Member's Name:</span>
          <input type="text" placeholder="Last Name, First Name, Middle Name"
            value={f.memberName} onChange={function (e) { setField("memberName", e.target.value); }} />
        </div>
      </div>
      <div className="ap-info-col">
        <div className="ap-row">
          <span>Birthday:</span>
          <input type="date" className="ap-w130" value={f.birthday} onChange={function (e) { setField("birthday", e.target.value); }} />
          <span className="ap-span-sm">Age:</span>
          <input type="number" className="ap-w60" value={f.age} onChange={function (e) { setField("age", e.target.value); }} />
          <span className="ap-span-sm">Sex:</span>
          <input type="text" className="ap-w60" value={f.sex} onChange={function (e) { setField("sex", e.target.value); }} />
        </div>
        <div className="ap-row"><span>BirthPlace:</span>
          <input type="text" value={f.birthPlace} onChange={function (e) { setField("birthPlace", e.target.value); }} /></div>
        <div className="ap-row">
          <span>Place Delivered:</span>
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
        <div className="ap-row">
          <span>Type of Delivery:</span>
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
        <div className="ap-row"><span>Birth Length:</span>
          <input type="text" className="ap-w120" value={f.birthLength} onChange={function (e) { setField("birthLength", e.target.value); }} /></div>
        <div className="ap-row"><span>Birth Weight:</span>
          <input type="text" className="ap-w120" value={f.birthWeight} onChange={function (e) { setField("birthWeight", e.target.value); }} /></div>
        <div className="ap-row"><span>Attendant at Birth:</span>
          <input type="text" value={f.attendantBirth} onChange={function (e) { setField("attendantBirth", e.target.value); }} /></div>
        <div className="ap-row"><span>Complete Address:</span>
          <input type="text" value={f.address} onChange={function (e) { setField("address", e.target.value); }} /></div>
      </div>

      <div className="ap-immun-section">
        <div className="ap-immun-header">
          <div>IMMUNIZATION</div><div>Date</div>
          <div>IMMUNIZATION</div><div>Date</div>
          <div>IMMUNIZATION</div><div>Date</div>
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
                  return (
                    <div key={v} className="ap-immun-row">
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

/* ── ADULT INFO ────────────────────────────────────────────────────────────── */
function AdultInfo(props) {
  const f = props.fields;
  const setField = props.setField;

  return (
    <div className="ap-info-grid">
      <div className="ap-info-col">
        <div className="ap-row"><span>Last Name:</span>
          <input type="text" value={f.lastName} onChange={function (e) { setField("lastName", e.target.value); }} /></div>
        <div className="ap-row">
          <span>First Name:</span>
          <input type="text" className="ap-flex2" value={f.firstName} onChange={function (e) { setField("firstName", e.target.value); }} />
          <span className="ap-span-sm">Suffix:</span>
          <input type="text" className="ap-w80" value={f.suffix} onChange={function (e) { setField("suffix", e.target.value); }} />
        </div>
        <div className="ap-row"><span>Middle Name:</span>
          <input type="text" value={f.middleName} onChange={function (e) { setField("middleName", e.target.value); }} /></div>
        <div className="ap-row"><span>Civil Status:</span>
          <input type="text" value={f.civilStatus} onChange={function (e) { setField("civilStatus", e.target.value); }} /></div>
        <div className="ap-row">
          <span>Maiden Name:</span>
          <input type="text" placeholder="For Married Women" value={f.maidenName} onChange={function (e) { setField("maidenName", e.target.value); }} />
        </div>
        <div className="ap-row"><span>PhilHealth #:</span>
          <input type="text" value={f.philHealth} onChange={function (e) { setField("philHealth", e.target.value); }} /></div>
        <div className="ap-row">
          <span>Name:</span>
          <input type="text" placeholder="Last Name, First Name, Middle Name"
            value={f.memberName} onChange={function (e) { setField("memberName", e.target.value); }} />
        </div>
        <div className="ap-row"><span>Member's Birthday:</span>
          <input type="date" value={f.memberBirthday} onChange={function (e) { setField("memberBirthday", e.target.value); }} /></div>
        <div className="ap-row">
          <span>Family Member:</span>
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
      <div className="ap-info-col">
        <div className="ap-row">
          <span>Birthday:</span>
          <input type="date" className="ap-w130" value={f.birthday} onChange={function (e) { setField("birthday", e.target.value); }} />
          <span className="ap-span-sm">Age:</span>
          <input type="number" className="ap-w60" value={f.age} onChange={function (e) { setField("age", e.target.value); }} />
          <span className="ap-span-sm">Sex:</span>
          <input type="text" className="ap-w60" value={f.sex} onChange={function (e) { setField("sex", e.target.value); }} />
        </div>
        <div className="ap-row"><span>BirthPlace:</span>
          <input type="text" value={f.birthPlace} onChange={function (e) { setField("birthPlace", e.target.value); }} /></div>
        <div className="ap-row"><span>Blood Type:</span>
          <input type="text" value={f.bloodType} onChange={function (e) { setField("bloodType", e.target.value); }} /></div>
        <div className="ap-row"><span>Father's Name:</span>
          <input type="text" value={f.fatherName} onChange={function (e) { setField("fatherName", e.target.value); }} /></div>
        <div className="ap-row"><span>Mother's Name:</span>
          <input type="text" value={f.motherName} onChange={function (e) { setField("motherName", e.target.value); }} /></div>
        <div className="ap-row"><span>Contact Number:</span>
          <input type="text" value={f.contact} onChange={function (e) { setField("contact", e.target.value); }} /></div>
        <div className="ap-row"><span>Religion:</span>
          <input type="text" value={f.religion} onChange={function (e) { setField("religion", e.target.value); }} /></div>
        <div className="ap-row"><span>Name of Spouse:</span>
          <input type="text" value={f.spouseName} onChange={function (e) { setField("spouseName", e.target.value); }} /></div>
        <div className="ap-row"><span>Complete Address:</span>
          <input type="text" value={f.address} onChange={function (e) { setField("address", e.target.value); }} /></div>
        <div className="ap-row"><span>Educational Attainment:</span>
          <input type="text" value={f.education} onChange={function (e) { setField("education", e.target.value); }} /></div>
      </div>

      <div className="ap-female-section">
        <p className="ap-female-title">For Female Patient Only:</p>
        <div className="ap-female-grid">
          <div className="ap-row"><span>Age of Menarche Started:</span>
            <input type="text" value={f.menarche} onChange={function (e) { setField("menarche", e.target.value); }} /></div>
          <div className="ap-row"><span>LMP:</span>
            <input type="text" value={f.lmp} onChange={function (e) { setField("lmp", e.target.value); }} /></div>
          <div className="ap-row"><span>Gravidity:</span>
            <input type="text" value={f.gravidity} onChange={function (e) { setField("gravidity", e.target.value); }} /></div>
          <div className="ap-row"><span>EDC (If Pregnant):</span>
            <input type="text" value={f.edc} onChange={function (e) { setField("edc", e.target.value); }} /></div>
          <div className="ap-row"><span>Parity:</span>
            <input type="text" value={f.parity} onChange={function (e) { setField("parity", e.target.value); }} /></div>
        </div>
        <div className="ap-parity-row">
          {[["Full Term", "fullterm"], ["Preterm", "preterm"], ["Abortion", "abortion"], ["Livebirth", "livebirth"]].map(function (pair) {
            const label = pair[0];
            const key = pair[1];
            return (
              <div key={key} className="ap-parity-item">
                <label>{label}</label>
                <input type="text" value={f[key]} onChange={function (e) { setField(key, e.target.value); }} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}