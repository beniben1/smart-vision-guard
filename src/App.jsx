/**
 * @file src/App.jsx
 * @description נקודת כניסה — Auth Guard שומר על ה-Dashboard
 *
 * לוגיקה:
 *  loading → מסך טעינה
 *  !user   → LoginScreen
 *  user    → Dashboard ✅
 */

import { useAuth }        from "./hooks/useAuth";
import LoginScreen        from "./components/auth/LoginScreen";
import SmartVisionGuard   from "./components/dashboard/Dashboard"; // הקובץ הראשי

export default function App() {
  const { user, loading, logout } = useAuth();

  // ── טעינה ראשונית (Firebase בודק session) ────────────────────────────────
  if (loading) {
    return (
      <div style={{
        minHeight: "100vh", background: "#060606",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "monospace", color: "#00e5ff33", letterSpacing: 3, fontSize: 12,
      }}>
        <div>
          <div style={{
            width: 32, height: 32, border: "2px solid #00e5ff22",
            borderTopColor: "#00e5ff", borderRadius: "50%",
            animation: "spin 0.8s linear infinite", margin: "0 auto 16px",
          }} />
          LOADING...
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── לא מחובר → מסך כניסה ─────────────────────────────────────────────────
  if (!user) {
    return <LoginScreen onLogin={() => {}} />;
    // onLogin ריק — useAuth יתעדכן אוטומטית דרך onAuthStateChanged
  }

  // ── מחובר → Dashboard עם מידע המשתמש ────────────────────────────────────
  return <SmartVisionGuard user={user} onLogout={logout} />;
}
