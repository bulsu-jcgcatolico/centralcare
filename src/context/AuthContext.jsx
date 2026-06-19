import { createContext, useContext, useState, useEffect } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../firebase/config";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true); // ← IMPORTANT: starts as true

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", firebaseUser.uid));
          if (userDoc.exists()) {
            setUser(firebaseUser);
            setUserData(userDoc.data());
          } else {
            setUser(null);
            setUserData(null);
          }
        } catch (error) {
          setUser(null);
          setUserData(null);
        }
      } else {
        setUser(null);
        setUserData(null);
      }
      setLoading(false); // ← done checking
    });

    return () => unsubscribe();
  }, []);

  async function login(email, password) {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      const userDoc = await getDoc(doc(db, "users", result.user.uid));
      if (!userDoc.exists()) throw new Error("User data not found");
      const data = userDoc.data();
      setUserData(data);
      return { success: true, role: data.role };
    } catch (error) {
      let message = "Login failed";
      if (error.code === "auth/user-not-found") message = "Account not found";
      if (error.code === "auth/wrong-password") message = "Incorrect password";
      if (error.code === "auth/invalid-credential") message = "Invalid email or password";
      if (error.code === "auth/too-many-requests") message = "Too many attempts. Try again later";
      return { success: false, message };
    }
  }

  async function logout() {
    await signOut(auth);
    setUser(null);
    setUserData(null);
  }

  async function getToken() {
    if (user) return await user.getIdToken();
    return null;
  }

  const value = {
    user,
    userData,
    loading,
    login,
    logout,
    getToken,
    role: userData?.role,
    rhuId: userData?.rhuId,
    rhuName: userData?.rhuName,
    barangayId: userData?.barangayId,
    barangayName: userData?.barangayName,
    username: userData?.username,
  };

  // Show loading screen while Firebase checks session
  if (loading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        fontFamily: "DM Sans, sans-serif",
        fontSize: "16px",
        color: "#6b7280",
        background: "#f8fafc"
      }}>
        Loading CentralCare...
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}