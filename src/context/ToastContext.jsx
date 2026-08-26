import { createContext, useCallback, useContext, useRef, useState } from "react";

const ToastContext = createContext(null);

let idCounter = 0;

/**
 * Wrap your app once with <ToastProvider> (in main.jsx or App.jsx, outside/inside
 * AuthProvider — order doesn't matter). Then in any component:
 *
 *   import { useToast } from "../../context/ToastContext";
 *   const { showToast } = useToast();
 *   showToast("Batch saved!", "success");
 *   showToast("Error: " + err.message, "error");
 *
 * Types: "success" (green), "error" (red), "info" (blue, default).
 * Toasts auto-dismiss after 4s and can be dismissed early by clicking them.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    if (timers.current[id]) {
      clearTimeout(timers.current[id]);
      delete timers.current[id];
    }
  }, []);

  const showToast = useCallback((message, type = "info", duration = 4000) => {
    const id = ++idCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    timers.current[id] = setTimeout(() => dismissToast(id), duration);
    return id;
  }, [dismissToast]);

  return (
    <ToastContext.Provider value={{ showToast, dismissToast }}>
      {children}
      <div style={containerStyle} aria-live="polite" aria-atomic="true">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => dismissToast(t.id)}
            style={{ ...toastStyle, ...typeStyles[t.type] }}
            role="status"
          >
            <span style={iconStyle}>{typeIcons[t.type] ?? typeIcons.info}</span>
            <span style={{ flex: 1 }}>{t.message}</span>
            <span style={closeStyle}>&times;</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast() must be used inside a <ToastProvider>. Wrap your app root with it.");
  }
  return ctx;
}

const containerStyle = {
  position: "fixed",
  top: "20px",
  right: "20px",
  zIndex: 9999,
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  maxWidth: "360px",
  pointerEvents: "none",
};

const toastStyle = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  padding: "12px 14px",
  borderRadius: "10px",
  fontSize: "13px",
  fontWeight: 500,
  boxShadow: "0 10px 25px -5px rgba(0,0,0,0.15), 0 4px 6px -2px rgba(0,0,0,0.05)",
  cursor: "pointer",
  pointerEvents: "auto",
  animation: "centralcare-toast-in 0.2s ease-out",
};

const iconStyle = { fontSize: "15px", flexShrink: 0, lineHeight: 1 };
const closeStyle = { opacity: 0.6, fontSize: "16px", flexShrink: 0, lineHeight: 1 };

const typeStyles = {
  success: { background: "#f0fdf4", color: "#065f46", border: "1px solid #bbf7d0" },
  error:   { background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" },
  info:    { background: "#eff6ff", color: "#1e40af", border: "1px solid #bfdbfe" },
};

const typeIcons = {
  success: "\u2713",
  error: "\u2715",
  info: "\u2139",
};

// Injected once so the slide-in animation works without a separate CSS file.
if (typeof document !== "undefined" && !document.getElementById("centralcare-toast-keyframes")) {
  const style = document.createElement("style");
  style.id = "centralcare-toast-keyframes";
  style.textContent = `
    @keyframes centralcare-toast-in {
      from { opacity: 0; transform: translateX(20px); }
      to   { opacity: 1; transform: translateX(0); }
    }
  `;
  document.head.appendChild(style);
}