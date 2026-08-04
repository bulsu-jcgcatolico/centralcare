import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import PrivateRoute from "./components/shared/PrivateRoute";

import Login from "./pages/auth/Login";
import CHODashboard from "./pages/cho/CHODashboard";
import CHOItemManagement from "./pages/cho/CHOItemManagement";
import CHOBatchInventory from "./pages/cho/CHOBatchInventory";
import CHOBarangay from "./pages/cho/CHOBarangay";
import CHORHUManagement from "./pages/cho/CHORHUManagement";
import CHOPopulationReport from "./pages/cho/CHOPopulationReport";
import CHOBatchDistribution from "./pages/cho/CHOBatchDistribution";
import CHOReports from "./pages/cho/CHOReports";
import CHONotification from "./pages/cho/CHONotification";
import RHUDashboard from "./pages/rhu/RHUDashboard";
import RHUInventory from "./pages/rhu/RHUInventory";
import RHUBarangay from "./pages/rhu/RHUBarangay";
import RHUDistribution from "./pages/rhu/RHUDistribution";
import RHUReports from "./pages/rhu/RHUReports";
import RHUNotification from "./pages/rhu/RHUNotification";
import MidwifeDashboard from "./pages/midwife/MidwifeDashboard";
import MidwifePatient from "./pages/midwife/MidwifePatient";
import MidwifeAddPatient from "./pages/midwife/MidwifeAddPatient";
import MidwifeInventory from "./pages/midwife/MidwifeInventory";
import MidwifeDispense from "./pages/midwife/MidwifeDispense";
import MidwifeReports from "./pages/midwife/MidwifeReports";
import MidwifeNotification from "./pages/midwife/MidwifeNotification";
import MidwifeRequestLetter from "./pages/midwife/MidwifeRequestLetter";

const PR = ({ roles, children }) => (
  <PrivateRoute allowedRoles={roles}>{children}</PrivateRoute>
);

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Login />} />

          {/* CHO */}
          <Route path="/cho/dashboard"          element={<PR roles={["cho"]}><CHODashboard /></PR>} />
          <Route path="/cho/item-management"    element={<PR roles={["cho"]}><CHOItemManagement /></PR>} />
          <Route path="/cho/batch-inventory"    element={<PR roles={["cho"]}><CHOBatchInventory /></PR>} />
          <Route path="/cho/barangay"           element={<PR roles={["cho"]}><CHOBarangay /></PR>} />
          <Route path="/cho/rhu-management"     element={<PR roles={["cho"]}><CHORHUManagement /></PR>} />
          <Route path="/cho/population-report"  element={<PR roles={["cho"]}><CHOPopulationReport /></PR>} />
          <Route path="/cho/batch-distribution" element={<PR roles={["cho"]}><CHOBatchDistribution /></PR>} />
          <Route path="/cho/reports"            element={<PR roles={["cho"]}><CHOReports /></PR>} />
          <Route path="/cho/notifications"      element={<PR roles={["cho"]}><CHONotification /></PR>} />

          {/* RHU */}
          <Route path="/rhu/dashboard"     element={<PR roles={["rhu"]}><RHUDashboard /></PR>} />
          <Route path="/rhu/inventory"     element={<PR roles={["rhu"]}><RHUInventory /></PR>} />
          <Route path="/rhu/barangay"      element={<PR roles={["rhu"]}><RHUBarangay /></PR>} />
          <Route path="/rhu/distribution"  element={<PR roles={["rhu"]}><RHUDistribution /></PR>} />
          <Route path="/rhu/reports"       element={<PR roles={["rhu"]}><RHUReports /></PR>} />
          <Route path="/rhu/notifications" element={<PR roles={["rhu"]}><RHUNotification /></PR>} />

          {/* Midwife */}
          <Route path="/midwife/dashboard"          element={<PR roles={["midwife"]}><MidwifeDashboard /></PR>} />
          <Route path="/midwife/patients"           element={<PR roles={["midwife"]}><MidwifePatient /></PR>} />
          <Route path="/midwife/patients/add/child" element={<PR roles={["midwife"]}><MidwifeAddPatient type="child" /></PR>} />
          <Route path="/midwife/patients/add/adult" element={<PR roles={["midwife"]}><MidwifeAddPatient type="adult" /></PR>} />
          <Route path="/midwife/inventory"          element={<PR roles={["midwife"]}><MidwifeInventory /></PR>} />
          <Route path="/midwife/dispense"           element={<PR roles={["midwife"]}><MidwifeDispense /></PR>} />
          <Route path="/midwife/reports"            element={<PR roles={["midwife"]}><MidwifeReports /></PR>} />
          <Route path="/midwife/notifications"      element={<PR roles={["midwife"]}><MidwifeNotification /></PR>} />
          <Route path="/midwife/request-letter"     element={<PR roles={["midwife"]}><MidwifeRequestLetter /></PR>} />
          <Route path="/midwife/patients/edit/:id"  element={<PR roles={["midwife"]}><MidwifeAddPatient mode="edit" /></PR>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}