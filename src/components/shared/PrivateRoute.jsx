import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function PrivateRoute({ children, allowedRoles }) {
  const { user, userData, loading } = useAuth();

  // Still checking auth - don't redirect yet
  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "DM Sans, sans-serif",
        fontSize: "16px",
        color: "#6b7280"
      }}>
        Loading...
      </div>
    );
  }

  // Not logged in
  if (!user) return <Navigate to="/" replace />;

  // Wrong role
  if (allowedRoles && !allowedRoles.includes(userData?.role)) {
    if (userData?.role === "cho") return <Navigate to="/cho/dashboard" replace />;
    if (userData?.role === "rhu") return <Navigate to="/rhu/dashboard" replace />;
    if (userData?.role === "midwife") return <Navigate to="/midwife/dashboard" replace />;
    return <Navigate to="/" replace />;
  }

  return children;
}