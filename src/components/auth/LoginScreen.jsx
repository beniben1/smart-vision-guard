/**
 * @file src/components/auth/LoginScreen.jsx
 * @description מסך כניסה מאובטח — רק אתה יכול להיכנס
 *
 * עיצוב: טרמינל-סיבר / מערכת ביטחון
 * הוסף ל-.env:  VITE_ALLOWED_EMAIL=your@email.com
 */

import { useState, useEffect, useRef } from "react";
import { login } from "../../services/firebase/auth";

// ─── אייקון מגן ──────────────────────────────────────────────────────────────
const ShieldIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" style={{ width: "100%", height: "100%" }}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <polyline points="9 12 11 14 15 10" />
  </svg>
);

// ─── שורות "boot" שמופיעות בזו אחר זו ──────────────────────────────────────
const BOOT_LINES = [
  "> Initializing Smart-Vision Guard...",
  "> Loading AI modules... OK",
  "> Connecting to Firebase... OK",
  "> Security layer active",
  "> Authentication required.",
];

export default function LoginScreen({ onLogin }) {
  const [email,       setEmail]       = useState("");
  const [password,    setPassword]    = useState("");
  const [error,       setError]       = useState("");
  const [loading,     setLoading]     = useState(false);
  const [bootLines,   setBootLines]   = useState([]);
  const [bootDone,    setBootDone]    = useState(false);
  const [showForm,    setShowForm]    = useState(false);
  const emailRef = useRef(null);

  // ── אנימציית Boot ──────────────────────────────────────────────────────────
  useEffect(() => {
    let i = 0;
    const addLine = () => {
      if (i < BOOT_LINES.length) {
        setBootLines((prev) => [...prev, BOOT_LINES[i]]);
        i++;
        setTimeout(addLine, 320 + Math.random() * 180);
      } else {
        setTimeout(() => { setBootDone(true); }, 400);
        setTimeout(() => { setShowForm(true); emailRef.current?.focus(); }, 800);
      }
    };
    setTimeout(addLine, 400);
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!email || !password) { setError("מלא אימייל וסיסמה"); return; }
    setError("");
    setLoading(true);
    try {
      const user = await login(email, password);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter") handleSubmit(); };

  return (
    <div style={s.root}>
      {/* רקע grid */}
      <div style={s.grid} />
      {/* gradient glow */}
      <div style={s.glow} />

      <div style={s.container}>
        {/* לוגו */}
        <div style={s.logoWrap}>
          <div style={s.logoIcon}><ShieldIcon /></div>
          <div>
            <div style={s.logoTitle}>SMART-VISION</div>
            <div style={s.logoSub}>GUARD  ·  SECURE ACCESS</div>
          </div>
        </div>

        {/* Terminal boot log */}
        <div style={s.terminal}>
          {bootLines.map((line, i) => (
            <div key={i} style={{
              ...s.termLine,
              color: i === bootLines.length - 1 && !bootDone ? "#00e5ff" : "#445",
              animation: "fadeSlide 0.25s ease forwards",
            }}>
              {line}
            </div>
          ))}
          {bootDone && (
            <div style={{ ...s.termLine, color: "#22c55e" }}>
              ✓ System ready — please authenticate
            </div>
          )}
        </div>

        {/* פורם כניסה */}
        <div style={{
          ...s.formCard,
          opacity:   showForm ? 1 : 0,
          transform: showForm ? "translateY(0)" : "translateY(16px)",
          transition: "opacity 0.4s ease, transform 0.4s ease",
        }}>
          <p style={s.formTitle}>OPERATOR LOGIN</p>

          {/* שדה אימייל */}
          <div style={s.fieldWrap}>
            <label style={s.label}>EMAIL</label>
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKey}
              placeholder="your@email.com"
              style={s.input}
              autoComplete="username"
            />
          </div>

          {/* שדה סיסמה */}
          <div style={s.fieldWrap}>
            <label style={s.label}>PASSWORD</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKey}
              placeholder="••••••••••"
              style={s.input}
              autoComplete="current-password"
            />
          </div>

          {/* שגיאה */}
          {error && (
            <div style={s.errorBox}>
              <span style={{ marginLeft: 6 }}>⚠</span> {error}
            </div>
          )}

          {/* כפתור כניסה */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              ...s.submitBtn,
              opacity: loading ? 0.6 : 1,
              cursor:  loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? (
              <span style={s.spinner} />
            ) : (
              "AUTHENTICATE  →"
            )}
          </button>
        </div>

        {/* footer */}
        <p style={s.footer}>
          Smart-Vision Guard v2.0  ·  מכללת אשקלון  ·  גישה מורשית בלבד
        </p>
      </div>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Barlow:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }

        @keyframes fadeSlide {
          from { opacity: 0; transform: translateX(-6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        @keyframes scanH {
          0%   { transform: translateY(0); opacity: 0.6; }
          100% { transform: translateY(100vh); opacity: 0; }
        }

        input::placeholder { color: #2a2a2a; }
        input:focus { outline: none; border-color: #00e5ff55 !important; }
        input:focus + * { display: none; }
      `}</style>
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = {
  root: {
    minHeight: "100vh", background: "#060606",
    display: "flex", alignItems: "center", justifyContent: "center",
    fontFamily: "'IBM Plex Mono', monospace",
    position: "relative", overflow: "hidden",
  },
  grid: {
    position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
    backgroundImage: "linear-gradient(#ffffff03 1px,transparent 1px),linear-gradient(90deg,#ffffff03 1px,transparent 1px)",
    backgroundSize: "48px 48px",
  },
  glow: {
    position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
    background: "radial-gradient(ellipse 60% 50% at 50% 40%, #00e5ff08 0%, transparent 70%)",
  },
  container: {
    position: "relative", zIndex: 1,
    width: "100%", maxWidth: 420,
    padding: "0 20px",
    display: "flex", flexDirection: "column", gap: 24,
  },
  logoWrap: {
    display: "flex", alignItems: "center", gap: 14,
  },
  logoIcon: {
    width: 48, height: 48, color: "#00e5ff",
    filter: "drop-shadow(0 0 12px #00e5ff44)",
  },
  logoTitle: {
    fontSize: 20, fontWeight: 700, color: "#fff",
    letterSpacing: 4, lineHeight: 1,
    fontFamily: "'Barlow', sans-serif",
  },
  logoSub: {
    fontSize: 9, color: "#00e5ff66", letterSpacing: 3, marginTop: 3,
  },
  terminal: {
    background: "#0a0a0a", border: "1px solid #141414",
    borderRadius: 6, padding: "14px 16px",
    minHeight: 110, display: "flex", flexDirection: "column", gap: 5,
  },
  termLine: {
    fontSize: 11, letterSpacing: 0.5, lineHeight: 1.6,
  },
  formCard: {
    background: "#0d0d0d",
    border: "1px solid #1e1e1e",
    borderRadius: 8, padding: "24px 24px 20px",
    display: "flex", flexDirection: "column", gap: 16,
  },
  formTitle: {
    fontSize: 11, letterSpacing: 3, color: "#00e5ff88",
    marginBottom: 4,
  },
  fieldWrap: {
    display: "flex", flexDirection: "column", gap: 6,
  },
  label: {
    fontSize: 9, letterSpacing: 2, color: "#333",
  },
  input: {
    background: "#111", border: "1px solid #1e1e1e",
    borderRadius: 4, padding: "10px 14px",
    color: "#ccc", fontSize: 13, fontFamily: "'IBM Plex Mono', monospace",
    width: "100%", transition: "border-color 0.2s",
  },
  errorBox: {
    background: "#ff333311", border: "1px solid #ff333333",
    borderRadius: 4, padding: "8px 12px",
    color: "#ff4444", fontSize: 11, letterSpacing: 0.5,
    display: "flex", alignItems: "center", gap: 4,
  },
  submitBtn: {
    background: "#00e5ff11", border: "1px solid #00e5ff33",
    borderRadius: 4, padding: "12px",
    color: "#00e5ff", fontSize: 12, fontWeight: 700,
    letterSpacing: 2, width: "100%",
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 8, transition: "background 0.2s",
    fontFamily: "'IBM Plex Mono', monospace",
  },
  spinner: {
    display: "inline-block", width: 16, height: 16,
    border: "2px solid #00e5ff33",
    borderTopColor: "#00e5ff",
    borderRadius: "50%",
    animation: "spin 0.7s linear infinite",
  },
  footer: {
    textAlign: "center", fontSize: 9, color: "#1e1e1e", letterSpacing: 1,
  },
};
