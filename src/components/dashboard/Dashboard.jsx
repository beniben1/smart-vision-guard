/**
 * @file src/components/dashboard/Dashboard.jsx
 * @description Dashboard ראשי — גרסה סופית עם כל 5 הפיצ'רים
 *
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  פיצ'ר 1 — Armed/Disarmed Toggle בראש המסך                 ║
 * ║  פיצ'ר 2 — Audio Alert דרך useDetection                    ║
 * ║  פיצ'ר 3 — Sensitivity Slider בלייב ובהגדרות               ║
 * ║  פיצ'ר 4 — מסגרת אדומה + INTRUDER DETECTED banner          ║
 * ║  פיצ'ר 5 — סינון AI (רק 'person') דרך useDetection         ║
 * ║  Auth — מקבל { user, onLogout } מ-App.jsx                  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * props:
 *   user     {FirebaseUser} — המשתמש המחובר
 *   onLogout {Function}     — callback ליציאה
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { useDetection }      from "../../hooks/useDetection";
import { useRealtimeEvents } from "../../hooks/useRealtimeEvents";

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-component: ArmToggle — פיצ'ר 1
// ══════════════════════════════════════════════════════════════════════════════
function ArmToggle({ isArmed, onToggle }) {
  return (
    <button onClick={onToggle} style={{
      display:        "flex",
      alignItems:     "center",
      gap:            10,
      padding:        "8px 20px",
      borderRadius:   6,
      border:         "none",
      cursor:         "pointer",
      fontFamily:     "monospace",
      fontSize:       13,
      fontWeight:     700,
      letterSpacing:  2,
      transition:     "all 0.25s",
      background:     isArmed ? "#ff222218" : "#22c55e18",
      color:          isArmed ? "#ff4444"   : "#22c55e",
      outline:        `1px solid ${isArmed ? "#ff444444" : "#22c55e44"}`,
      boxShadow:      isArmed
        ? "0 0 20px #ff22220a, inset 0 0 12px #ff22220a"
        : "0 0 20px #22c55e0a, inset 0 0 12px #22c55e0a",
    }}>
      {/* indicator dot */}
      <span style={{
        display:       "inline-block",
        width:          8,
        height:         8,
        borderRadius:   "50%",
        background:    isArmed ? "#ff4444" : "#22c55e",
        animation:     isArmed ? "pulseDot 1s ease-in-out infinite" : "none",
      }} />
      {isArmed ? "ARMED" : "DISARMED"}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-component: CameraView — מצלמה + canvas + פיצ'ר 4
// ══════════════════════════════════════════════════════════════════════════════
function CameraView({ cameraActive, isArmed, minConfidence, audioEnabled, onIntruderDetected, onModelLoaded }) {
  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [camError, setCamError] = useState(null);
  const [vidReady, setVidReady] = useState(false);

  // useDetection — הלב של ה-AI
  const { modelLoaded, isScanning, fps, detections, uploadStatus, intruderActive } =
    useDetection({
      isArmed,
      cameraActive: cameraActive && vidReady,
      videoRef,
      canvasRef,
      minConfidence,
      audioEnabled,
      onIntruderDetected,
    });

  useEffect(() => { onModelLoaded?.(modelLoaded); }, [modelLoaded]);

  // ── הפעלת מצלמה ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (cameraActive) startCamera(); else stopCamera();
    return stopCamera;
  }, [cameraActive]);

  const startCamera = async () => {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch (e) {
      setCamError(e.name === "NotAllowedError"
        ? "גישה למצלמה נדחתה — אשר הרשאות בדפדפן"
        : "שגיאה: " + e.message);
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setVidReady(false);
  };

  // ── סטטוס upload ─────────────────────────────────────────────────────────
  const uploadLabel = {
    uploading: { text: "⬆ UPLOADING...", color: "#ffd700" },
    done:      { text: "✓ SAVED",        color: "#22c55e" },
    error:     { text: "✕ ERROR",        color: "#ff4444" },
  }[uploadStatus];

  if (camError) return (
    <div style={cs.feedCenter}>
      <p style={{ color: "#ff4444", fontFamily: "monospace", textAlign: "center", maxWidth: 300 }}>
        {camError}
      </p>
    </div>
  );

  return (
    <div style={{
      position: "relative", width: "100%", height: "100%",
      // פיצ'ר 4: גבול אדום + glow כשיש פורץ
      outline:   intruderActive ? "2px solid #ff2020" : "2px solid transparent",
      boxShadow: intruderActive ? "0 0 32px #ff202044, inset 0 0 32px #ff20200a" : "none",
      transition: "outline 0.1s, box-shadow 0.1s",
      borderRadius: 8, overflow: "hidden", background: "#000",
    }}>
      {/* וידאו */}
      <video
        ref={videoRef}
        autoPlay playsInline muted
        onLoadedMetadata={() => setVidReady(true)}
        style={{
          width: "100%", height: "100%", objectFit: "cover",
          opacity: cameraActive && vidReady ? 1 : 0, transition: "opacity 0.4s",
        }}
      />

      {/* Canvas Bounding Boxes */}
      <canvas ref={canvasRef} style={{
        position: "absolute", inset: 0,
        width: "100%", height: "100%", pointerEvents: "none",
      }} />

      {/* פיצ'ר 4: INTRUDER DETECTED banner */}
      {intruderActive && (
        <div style={cs.intruderBanner}>
          <span style={cs.intruderDot} />
          ⚠  INTRUDER DETECTED
          <span style={cs.intruderDot} />
        </div>
      )}

      {/* Idle placeholder */}
      {!cameraActive && (
        <div style={{ ...cs.feedCenter, position: "absolute", inset: 0 }}>
          <div style={cs.grid} />
          <div style={{ color: "#00e5ff18", fontSize: 72, lineHeight: 1 }}>◎</div>
          <p style={cs.idleText}>SYSTEM IDLE — AWAITING ACTIVATION</p>
          {["tl","tr","bl","br"].map(p => <HUDCorner key={p} pos={p} />)}
        </div>
      )}

      {/* HUD layer */}
      {cameraActive && (
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          <div style={cs.scanLine} />
          <div style={cs.liveBadge}><span style={cs.liveDot} />LIVE</div>
          {["tl","tr","bl","br"].map(p => (
            <HUDCorner key={p} pos={p} color={intruderActive ? "#ff2020" : "#00e5ff"} />
          ))}
          <div style={cs.aiBar}>
            <span style={{ color: "#444" }}>MODEL</span>{" "}
            <span style={{ color: modelLoaded ? "#22c55e" : "#ffd700" }}>
              {modelLoaded ? "COCO-SSD ✓" : "LOADING..."}
            </span>
            {"  ·  "}
            <span style={{ color: "#444" }}>FPS</span>{" "}
            <span style={{ color: "#00e5ff" }}>{fps}</span>
            {"  ·  "}
            <span style={{ color: "#444" }}>OBJ</span>{" "}
            <span style={{ color: detections.length > 0 ? "#ff4444" : "#333" }}>
              {detections.length}
            </span>
            {uploadLabel && (
              <>{"  ·  "}
                <span style={{ color: uploadLabel.color, fontWeight: 700 }}>
                  {uploadLabel.text}
                </span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── HUD corner helper ─────────────────────────────────────────────────────────
function HUDCorner({ pos, color = "#00e5ff33" }) {
  const sz = 18;
  const m = {
    tl: { top: 12, left: 12,  borderTopWidth: 2, borderLeftWidth: 2 },
    tr: { top: 12, right: 12, borderTopWidth: 2, borderRightWidth: 2 },
    bl: { bottom: 12, left: 12,  borderBottomWidth: 2, borderLeftWidth: 2 },
    br: { bottom: 12, right: 12, borderBottomWidth: 2, borderRightWidth: 2 },
  }[pos];
  return <div style={{ position: "absolute", width: sz, height: sz,
    borderColor: color, borderStyle: "solid", borderWidth: 0, ...m }} />;
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-component: Sidebar
// ══════════════════════════════════════════════════════════════════════════════
function Sidebar({ view, onNav, user, onLogout, alertCount }) {
  const nav = [
    { id: "live",     icon: "◉", label: "Live Feed"  },
    { id: "events",   icon: "≡", label: "Event Log", badge: alertCount },
    { id: "settings", icon: "⚙", label: "Settings"   },
  ];
  return (
    <aside style={ss.sidebar}>
      {/* Logo */}
      <div style={ss.logo}>
        <div style={ss.logoMark}>SV</div>
        <div>
          <div style={ss.logoTitle}>SMART-VISION</div>
          <div style={ss.logoSub}>GUARD  ·  v2.1</div>
        </div>
      </div>
      <div style={ss.sep} />

      {/* Nav */}
      <p style={ss.navLabel}>NAVIGATION</p>
      {nav.map(({ id, icon, label, badge }) => (
        <button key={id} onClick={() => onNav(id)}
          style={{ ...ss.navBtn, ...(view === id ? ss.navActive : {}) }}>
          <span style={{ fontSize: 15 }}>{icon}</span>
          <span style={{ flex: 1 }}>{label}</span>
          {badge > 0 && <span style={ss.badge}>{badge}</span>}
          {view === id && <div style={ss.activeBar} />}
        </button>
      ))}

      <div style={{ flex: 1 }} />
      <div style={ss.sep} />

      {/* User info + Logout */}
      <div style={ss.userRow}>
        <div style={ss.userAvatar}>
          {user?.email?.[0]?.toUpperCase() ?? "U"}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={ss.userEmail}>{user?.email ?? "operator"}</p>
          <p style={ss.userRole}>OPERATOR</p>
        </div>
        <button onClick={onLogout} style={ss.logoutBtn} title="התנתק">⏻</button>
      </div>
    </aside>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-component: TopBar
// ══════════════════════════════════════════════════════════════════════════════
function TopBar({ isArmed, onArmToggle, cameraActive, onCameraToggle }) {
  return (
    <div style={tb.bar}>
      {/* שם עמוד */}
      <div>
        <p style={tb.title}>Security Dashboard</p>
        <p style={tb.sub}>Smart-Vision Guard — Real-time AI Monitoring</p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        {/* Camera power */}
        <button onClick={onCameraToggle} style={{
          ...tb.btn,
          background: cameraActive ? "#00e5ff11" : "#ffffff09",
          color:      cameraActive ? "#00e5ff"   : "#444",
          outline:    `1px solid ${cameraActive ? "#00e5ff33" : "#222"}`,
        }}>
          {cameraActive ? "◉ Camera ON" : "○ Camera OFF"}
        </button>

        {/* פיצ'ר 1: Armed Toggle */}
        <ArmToggle isArmed={isArmed} onToggle={onArmToggle} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-component: StatsRow
// ══════════════════════════════════════════════════════════════════════════════
function StatsRow({ stats, isArmed }) {
  const cards = [
    { label: "AI Model",       value: "COCO-SSD",               color: "#ffd700" },
    { label: "Alerts Today",   value: String(stats.todayCount), color: "#ff4444" },
    { label: "Total Events",   value: String(stats.total),      color: "#00e5ff" },
    { label: "System Status",  value: isArmed ? "ARMED" : "DISARMED",
      color: isArmed ? "#ff4444" : "#22c55e" },
  ];
  return (
    <div style={{ display: "flex", gap: 10 }}>
      {cards.map(({ label, value, color }) => (
        <div key={label} style={st.card}>
          <p style={st.cardLabel}>{label}</p>
          <p style={{ ...st.cardValue, color }}>{value}</p>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-component: EventLog
// ══════════════════════════════════════════════════════════════════════════════
function EventLog({ events }) {
  const fmt = d => d instanceof Date
    ? `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}:${String(d.getSeconds()).padStart(2,"0")}`
    : "--:--:--";

  return (
    <div style={{ padding: "24px 28px", flex: 1, overflowY: "auto" }}>
      <h2 style={pg.title}>
        Event Log
        <span style={pg.badge}>{events.length}</span>
      </h2>
      {events.length === 0 && (
        <p style={{ color: "#2a2a2a", fontFamily: "monospace", fontSize: 13 }}>
          ממתין לאירועים... הפעל מצלמה ו-Armed
        </p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {events.map(ev => {
          const isPerson = ev.label === "person";
          const c = isPerson ? "#ff4444" : "#00e5ff";
          return (
            <div key={ev.id} style={{
              display: "flex", alignItems: "center", gap: 12,
              background: "#0d0d0d",
              border: `1px solid ${isPerson ? "#ff44441a" : "#161616"}`,
              borderRadius: 6, padding: "11px 14px",
              fontFamily: "monospace", fontSize: 11,
              animation: "fadeIn 0.3s ease",
            }}>
              <span style={{ color: c, border: `1px solid ${c}44`,
                borderRadius: 3, padding: "2px 7px", fontSize: 9,
                letterSpacing: 1, flexShrink: 0 }}>
                {isPerson ? "⚠ PERSON" : ev.label?.toUpperCase()}
              </span>
              <span style={{ color: "#333", flexShrink: 0 }}>{fmt(ev.timestamp)}</span>
              <span style={{ color: "#666", flex: 1 }}>
                {isPerson ? "אדם זוהה — הפעלת התראה" : `${ev.label} זוהה בשדה הראייה`}
              </span>
              <span style={{ color: ev.confidence > 90 ? "#22c55e" : ev.confidence > 75 ? "#ffd700" : "#ff4444",
                fontWeight: 700 }}>
                {Math.round(ev.confidence)}%
              </span>
              <span style={{ color: ev.status === "notified" ? "#22c55e" : "#2a2a2a",
                fontSize: 9, letterSpacing: 1 }}>
                {ev.status === "notified" ? "✓ WA" : ev.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-component: SettingsPanel — פיצ'ר 3 (Sensitivity Slider)
// ══════════════════════════════════════════════════════════════════════════════
function SettingsPanel({ minConfidence, setMinConfidence, audioEnabled, setAudioEnabled, cooldown, setCooldown }) {
  return (
    <div style={{ padding: "24px 28px", maxWidth: 500, flex: 1, overflowY: "auto" }}>
      <h2 style={pg.title}>Settings</h2>

      {/* פיצ'ר 3: Sensitivity Slider */}
      <SettingRow
        label="רגישות זיהוי (AI Sensitivity)"
        desc={`זיהוי יופעל רק מעל ${Math.round(minConfidence * 100)}% ביטחון — כרגע: רק "person"`}
        accent="#00e5ff"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#444", fontSize: 10 }}>נמוך (50%)</span>
            <span style={{ color: "#00e5ff", fontFamily: "monospace", fontSize: 14, fontWeight: 700 }}>
              {Math.round(minConfidence * 100)}%
            </span>
            <span style={{ color: "#444", fontSize: 10 }}>גבוה (99%)</span>
          </div>
          <input
            type="range" min={50} max={99} step={1}
            value={Math.round(minConfidence * 100)}
            onChange={e => setMinConfidence(+e.target.value / 100)}
            style={{ width: "100%", accentColor: "#00e5ff", cursor: "pointer" }}
          />
          <div style={{ display: "flex", gap: 6 }}>
            {[60, 70, 75, 85, 90].map(v => (
              <button key={v} onClick={() => setMinConfidence(v / 100)}
                style={{
                  flex: 1, padding: "4px 0", borderRadius: 3, border: "none",
                  cursor: "pointer", fontSize: 10, fontFamily: "monospace",
                  background: Math.round(minConfidence * 100) === v ? "#00e5ff22" : "#111",
                  color: Math.round(minConfidence * 100) === v ? "#00e5ff" : "#333",
                  outline: `1px solid ${Math.round(minConfidence * 100) === v ? "#00e5ff44" : "#1a1a1a"}`,
                }}>
                {v}%
              </button>
            ))}
          </div>
        </div>
      </SettingRow>

      {/* פיצ'ר 2: Audio Toggle */}
      <SettingRow
        label="התראות קול (Audio Alert)"
        desc="מנגן סדרת beeps דרך הרמקול בכל זיהוי אדם"
        accent="#ffd700"
      >
        <Toggle v={audioEnabled} set={setAudioEnabled} color="#ffd700" />
      </SettingRow>

      {/* Cooldown Slider */}
      <SettingRow
        label="Cooldown בין התראות"
        desc={`המתן לפחות ${cooldown} שניות בין שתי התראות עוקבות`}
        accent="#a78bfa"
      >
        <input type="range" min={3} max={30} step={1} value={cooldown}
          onChange={e => setCooldown(+e.target.value)}
          style={{ accentColor: "#a78bfa", width: 120 }} />
        <code style={{ color: "#a78bfa", fontSize: 14, fontFamily: "monospace", minWidth: 32 }}>
          {cooldown}s
        </code>
      </SettingRow>

      <div style={{ height: 1, background: "#141414", margin: "8px 0 20px" }} />
      <p style={{ color: "#1e1e1e", fontSize: 9, fontFamily: "monospace" }}>
        Smart-Vision Guard v2.1 · COCO-SSD · Firebase · Twilio · מכללת אשקלון 2025
      </p>
    </div>
  );
}

function SettingRow({ label, desc, accent = "#00e5ff", children }) {
  return (
    <div style={{ padding: "18px 0", borderBottom: "1px solid #0f0f0f" }}>
      <p style={{ color: "#ccc", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</p>
      <p style={{ color: "#383838", fontSize: 11, marginBottom: 12 }}>{desc}</p>
      {children}
    </div>
  );
}

function Toggle({ v, set, color = "#00e5ff" }) {
  return (
    <button onClick={() => set(!v)} style={{
      width: 46, height: 25, borderRadius: 13, border: "none", cursor: "pointer",
      position: "relative", background: v ? color + "22" : "#141414",
      outline: `1px solid ${v ? color + "44" : "#1e1e1e"}`,
      transition: "background 0.2s",
    }}>
      <div style={{
        position: "absolute", top: 3, left: v ? 23 : 3,
        width: 19, height: 19, borderRadius: "50%",
        background: v ? color : "#2a2a2a",
        transition: "left 0.18s, background 0.2s",
      }} />
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Sub-component: StatusBar
// ══════════════════════════════════════════════════════════════════════════════
function StatusBar({ isArmed, cameraActive, stats }) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const p = n => String(n).padStart(2, "0");
  const ts = `${p(time.getHours())}:${p(time.getMinutes())}:${p(time.getSeconds())}`;

  return (
    <footer style={stb.bar}>
      <span style={{ color: isArmed ? "#ff4444" : "#22c55e", fontWeight: 700 }}>
        {isArmed ? "● ARMED" : "○ DISARMED"}
      </span>
      <Div />
      <span style={{ color: cameraActive ? "#00e5ff" : "#333" }}>
        {cameraActive ? "◉ CAMERA ACTIVE" : "○ CAMERA OFF"}
      </span>
      <Div />
      <span style={{ color: "#444" }}>
        היום: <b style={{ color: "#ffd700" }}>{stats.todayCount}</b>
      </span>
      <div style={{ flex: 1 }} />
      <span style={{ color: "#1e1e1e", fontSize: 10 }}>Firebase ●</span>
      <Div />
      <span style={{ fontFamily: "monospace", color: "#00e5ff88", letterSpacing: 1 }}>{ts}</span>
    </footer>
  );
}
function Div() {
  return <span style={{ width: 1, height: 14, background: "#1a1a1a", display: "inline-block" }} />;
}

// ══════════════════════════════════════════════════════════════════════════════
//  ROOT: Dashboard
// ══════════════════════════════════════════════════════════════════════════════
export default function Dashboard({ user, onLogout }) {
  const [view,          setView]          = useState("live");
  const [cameraActive,  setCameraActive]  = useState(false);
  const [isArmed,       setIsArmed]       = useState(false);
  const [minConf,       setMinConf]       = useState(0.75);  // פיצ'ר 3
  const [audioEnabled,  setAudioEnabled]  = useState(true);  // פיצ'ר 2
  const [cooldown,      setCooldown]      = useState(8);
  const [hasFlash,      setHasFlash]      = useState(false); // Flash אדום כל-מסך
  const [localEvents,   setLocalEvents]   = useState([]);    // Optimistic UI
  const flashTimerRef = useRef(null);

  // Real-time Firestore events
  const { events: firestoreEvents, stats } = useRealtimeEvents?.() ?? {
    events: localEvents,
    stats: {
      total: localEvents.length,
      todayCount: localEvents.filter(e => {
        const t = new Date(); t.setHours(0,0,0,0);
        return e.timestamp >= t;
      }).length,
      alertCount: localEvents.filter(e => e.label === "person").length,
    }
  };

  // Merge firestore + local (remove duplicates)
  const allEvents = firestoreEvents?.length > 0 ? firestoreEvents : localEvents;

  // ── Intruder detected callback ────────────────────────────────────────────
  const handleIntruder = useCallback(({ confidence, bbox }) => {
    // Flash אדום (פיצ'ר 4)
    setHasFlash(true);
    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setHasFlash(false), 1_400);

    // Optimistic local event
    const ev = {
      id:         `local_${Date.now()}`,
      label:      "person",
      confidence,
      bbox,
      timestamp:  new Date(),
      status:     isArmed ? "uploading" : "local-only",
    };
    setLocalEvents(prev => [ev, ...prev].slice(0, 25));
  }, [isArmed]);

  // ── Armed toggle (cameraActive doit être true) ────────────────────────────
  const handleArmToggle = () => {
    if (!cameraActive && !isArmed) {
      // Arm implique démarrer la camera
      setCameraActive(true);
    }
    setIsArmed(v => !v);
  };

  return (
    <div style={r.root}>
      {/* Flash אדום — פיצ'ר 4 */}
      {hasFlash && <div style={r.flash} />}

      {/* Armed Overlay glow */}
      {isArmed && <div style={r.armedGlow} />}

      <div style={r.bg} />

      <div style={r.shell}>
        {/* Sidebar */}
        <Sidebar
          view={view}
          onNav={setView}
          user={user}
          onLogout={onLogout}
          alertCount={stats?.alertCount ?? 0}
        />

        {/* Main */}
        <div style={r.main}>
          {/* TopBar */}
          <TopBar
            isArmed={isArmed}
            onArmToggle={handleArmToggle}
            cameraActive={cameraActive}
            onCameraToggle={() => {
              if (cameraActive && isArmed) setIsArmed(false);
              setCameraActive(v => !v);
            }}
          />

          {/* Content area */}
          <div style={r.content}>
            {/* ── Live Feed ── */}
            {view === "live" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16, height: "100%" }}>
                {/* Video window 16:9 */}
                <div style={{
                  aspectRatio: "16/9", width: "100%",
                  maxHeight: "calc(100vh - 310px)",
                  borderRadius: 8, overflow: "hidden",
                  border: `1px solid ${isArmed ? "#ff222233" : "#161616"}`,
                  transition: "border-color 0.3s",
                }}>
                  <CameraView
                    cameraActive={cameraActive}
                    isArmed={isArmed}
                    minConfidence={minConf}
                    audioEnabled={audioEnabled}
                    onIntruderDetected={handleIntruder}
                  />
                </div>

                {/* פיצ'ר 3: Mini Sensitivity Slider מתחת לוידאו */}
                <div style={r.miniSlider}>
                  <span style={{ color: "#333", fontSize: 10, fontFamily: "monospace" }}>
                    SENSITIVITY
                  </span>
                  <input
                    type="range" min={50} max={99} step={1}
                    value={Math.round(minConf * 100)}
                    onChange={e => setMinConf(+e.target.value / 100)}
                    style={{ flex: 1, accentColor: "#00e5ff", cursor: "pointer" }}
                  />
                  <code style={{ color: "#00e5ff", fontSize: 12, fontFamily: "monospace", minWidth: 36 }}>
                    {Math.round(minConf * 100)}%
                  </code>
                  <span style={{ color: "#333", fontSize: 10, fontFamily: "monospace" }}>
                    COOLDOWN
                  </span>
                  <input
                    type="range" min={3} max={30} step={1}
                    value={cooldown}
                    onChange={e => setCooldown(+e.target.value)}
                    style={{ flex: 1, accentColor: "#a78bfa", cursor: "pointer" }}
                  />
                  <code style={{ color: "#a78bfa", fontSize: 12, fontFamily: "monospace", minWidth: 28 }}>
                    {cooldown}s
                  </code>
                </div>

                <StatsRow stats={stats ?? { todayCount: 0, total: 0 }} isArmed={isArmed} />
              </div>
            )}

            {view === "events"   && <EventLog events={allEvents} />}

            {view === "settings" && (
              <SettingsPanel
                minConfidence={minConf}
                setMinConfidence={setMinConf}
                audioEnabled={audioEnabled}
                setAudioEnabled={setAudioEnabled}
                cooldown={cooldown}
                setCooldown={setCooldown}
              />
            )}
          </div>
        </div>
      </div>

      <StatusBar isArmed={isArmed} cameraActive={cameraActive}
        stats={stats ?? { todayCount: 0, total: 0 }} />

      {/* CSS */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Barlow:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #080808; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-thumb { background: #1e1e1e; border-radius: 2px; }

        @keyframes pulseDot {
          0%,100% { opacity: 1; transform: scale(1); }
          50%      { opacity: 0.4; transform: scale(0.7); }
        }
        @keyframes scanLine {
          0%   { top: 0%;   opacity: 0.5; }
          100% { top: 100%; opacity: 0;   }
        }
        @keyframes flashAlert {
          0%   { opacity: 0; }
          10%  { opacity: 1; }
          40%  { opacity: 0.5; }
          70%  { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes intruderPulse {
          0%,100% { opacity: 1; }
          50%     { opacity: 0.6; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(5px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        input[type=range] { height: 4px; }
        input::placeholder { color: #1e1e1e; }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
//  Styles
// ══════════════════════════════════════════════════════════════════════════════

// Root
const r = {
  root:  { fontFamily: "'Barlow',sans-serif", background: "#080808", color: "#ccc",
           height: "100vh", display: "flex", flexDirection: "column",
           overflow: "hidden", position: "relative" },
  bg:    { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
           backgroundImage: "radial-gradient(ellipse 55% 40% at 50% 30%,#00e5ff05 0%,transparent 60%)" },
  armedGlow: { position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none",
    backgroundImage: "radial-gradient(ellipse 60% 40% at 50% 30%,#ff202008 0%,transparent 60%)",
    transition: "opacity 0.5s" },
  flash: { position: "fixed", inset: 0, zIndex: 9999, pointerEvents: "none",
           background: "rgba(255,20,20,0.15)",
           boxShadow: "inset 0 0 140px rgba(255,20,20,0.35)",
           animation: "flashAlert 1.4s ease forwards" },
  shell: { display: "flex", flex: 1, overflow: "hidden", position: "relative", zIndex: 1 },
  main:  { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
  content: { flex: 1, overflowY: "auto", padding: "20px 28px" },
  miniSlider: { display: "flex", alignItems: "center", gap: 10,
    background: "#0a0a0a", border: "1px solid #141414",
    borderRadius: 6, padding: "8px 14px" },
};

// Sidebar
const ss = {
  sidebar: { width: 215, background: "#0b0b0b", borderRight: "1px solid #141414",
    display: "flex", flexDirection: "column", padding: "20px 0", flexShrink: 0 },
  logo:    { display: "flex", alignItems: "center", gap: 10, padding: "0 18px 20px" },
  logoMark:{ width: 34, height: 34, borderRadius: 6, background: "#00e5ff0f",
    border: "1px solid #00e5ff22", display: "flex", alignItems: "center",
    justifyContent: "center", color: "#00e5ff", fontWeight: 700,
    fontSize: 12, fontFamily: "monospace", flexShrink: 0 },
  logoTitle:{ fontSize: 11, fontWeight: 700, color: "#ddd", letterSpacing: 3,
    fontFamily: "'Barlow',sans-serif" },
  logoSub: { fontSize: 8, color: "#00e5ff44", letterSpacing: 2, fontFamily: "monospace" },
  sep:     { height: 1, background: "#141414", margin: "0 18px 16px" },
  navLabel:{ fontSize: 8, color: "#222", letterSpacing: 2, padding: "0 18px 10px",
    fontFamily: "monospace" },
  navBtn:  { display: "flex", alignItems: "center", gap: 10, width: "100%",
    padding: "10px 18px", background: "none", border: "none", cursor: "pointer",
    color: "#2e2e2e", fontSize: 12, fontFamily: "'Barlow',sans-serif",
    fontWeight: 600, textAlign: "left", position: "relative" },
  navActive:{ color: "#eee", background: "#ffffff04" },
  activeBar:{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
    width: 2, height: 18, background: "#00e5ff", borderRadius: 1 },
  badge:   { background: "#ff444420", color: "#ff4444", fontSize: 9,
    border: "1px solid #ff444440", borderRadius: 10, padding: "1px 6px",
    fontFamily: "monospace" },
  userRow: { display: "flex", alignItems: "center", gap: 10, padding: "12px 18px" },
  userAvatar:{ width: 30, height: 30, borderRadius: "50%", background: "#00e5ff15",
    border: "1px solid #00e5ff33", display: "flex", alignItems: "center",
    justifyContent: "center", color: "#00e5ff", fontSize: 13, fontWeight: 700,
    flexShrink: 0, fontFamily: "monospace" },
  userEmail:{ color: "#444", fontSize: 10, fontFamily: "monospace",
    whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  userRole: { color: "#222", fontSize: 8, letterSpacing: 2, fontFamily: "monospace" },
  logoutBtn:{ background: "none", border: "1px solid #1e1e1e", borderRadius: 4,
    color: "#333", cursor: "pointer", padding: "4px 7px", fontSize: 13,
    flexShrink: 0 },
};

// TopBar
const tb = {
  bar:   { display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "14px 28px", borderBottom: "1px solid #111", flexShrink: 0 },
  title: { color: "#eee", fontSize: 15, fontWeight: 700, letterSpacing: 0.5 },
  sub:   { color: "#2e2e2e", fontSize: 10, fontFamily: "monospace", marginTop: 2 },
  btn:   { padding: "7px 14px", borderRadius: 5, border: "none", cursor: "pointer",
    fontSize: 11, fontFamily: "monospace", letterSpacing: 1, transition: "all 0.2s" },
};

// Stats cards
const st = {
  card:       { flex: 1, background: "#0d0d0d", border: "1px solid #141414",
    borderRadius: 6, padding: "12px 14px" },
  cardLabel:  { color: "#2a2a2a", fontSize: 9, letterSpacing: 1,
    fontFamily: "monospace", marginBottom: 6 },
  cardValue:  { fontSize: 20, fontFamily: "monospace", fontWeight: 700 },
};

// Camera styles
const cs = {
  feedCenter: { display: "flex", flexDirection: "column", alignItems: "center",
    justifyContent: "center", height: "100%", position: "relative", background: "#070707" },
  grid:        { position: "absolute", inset: 0,
    backgroundImage: "linear-gradient(#ffffff02 1px,transparent 1px),linear-gradient(90deg,#ffffff02 1px,transparent 1px)",
    backgroundSize: "44px 44px" },
  idleText:    { color: "#00e5ff2a", fontFamily: "monospace", marginTop: 14,
    letterSpacing: 3, fontSize: 11 },
  scanLine:    { position: "absolute", left: 0, right: 0, height: 1,
    background: "linear-gradient(90deg,transparent,#00e5ff44,transparent)",
    animation: "scanLine 2.8s ease-in-out infinite", top: 0 },
  liveBadge:   { position: "absolute", top: 12, left: 12, display: "flex",
    alignItems: "center", gap: 5, background: "#ff000020",
    border: "1px solid #ff000044", borderRadius: 3, padding: "3px 7px",
    fontSize: 9, fontFamily: "monospace", color: "#ff4d4d", letterSpacing: 2 },
  liveDot:     { display: "inline-block", width: 5, height: 5, borderRadius: "50%",
    background: "#ff4d4d", animation: "pulseDot 1s ease-in-out infinite" },
  aiBar:       { position: "absolute", bottom: 12, left: 12, fontSize: 10,
    fontFamily: "monospace", letterSpacing: 0.5, color: "#444" },
  // פיצ'ר 4: INTRUDER DETECTED banner
  intruderBanner: {
    position:        "absolute",
    top:             "50%",
    left:            "50%",
    transform:       "translate(-50%, -50%)",
    display:         "flex",
    alignItems:      "center",
    gap:             12,
    background:      "rgba(255,20,20,0.88)",
    border:          "1px solid #ff2020",
    borderRadius:    6,
    padding:         "10px 24px",
    color:           "#fff",
    fontFamily:      "monospace",
    fontWeight:      700,
    fontSize:        16,
    letterSpacing:   3,
    animation:       "intruderPulse 0.6s ease-in-out infinite",
    pointerEvents:   "none",
    zIndex:          10,
    textShadow:      "0 0 12px #ff2020",
    boxShadow:       "0 0 30px #ff202044",
  },
  intruderDot: { display: "inline-block", width: 8, height: 8,
    borderRadius: "50%", background: "#fff" },
};

// Page
const pg = {
  title: { color: "#ddd", fontSize: 17, fontWeight: 700, letterSpacing: 0.5,
    marginBottom: 20, display: "flex", alignItems: "center", gap: 10 },
  badge: { background: "#ffffff0a", border: "1px solid #1e1e1e",
    borderRadius: 10, padding: "2px 8px", fontSize: 11,
    color: "#333", fontFamily: "monospace" },
};

// Status bar
const stb = {
  bar: { height: 34, background: "#090909", borderTop: "1px solid #111",
    display: "flex", alignItems: "center", gap: 12, padding: "0 18px",
    flexShrink: 0, fontSize: 11, fontFamily: "monospace" },
};
