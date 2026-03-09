/**
 * @file src/services/ai/forensics.js
 * @description פיצ'ר 3 — Digital Forensic Signing
 *
 * ═══════════════════════════════════════════════════════════════
 *  מטרה:
 *  ─────
 *  כל אירוע מקבל חתימה דיגיטלית SHA-256 שמבטיחה:
 *  א. Integrity  — לא ניתן לשנות את נתוני האירוע בלי לשבור את ה-Hash
 *  ב. Tamper Evidence — כל שינוי ב-timestamp/confidence/snapshot
 *                       ייצר hash שונה לחלוטין
 *  ג. Chain of Custody — ניתן להוכיח בבית משפט שהראיה מקורית
 *
 *  שיטה:
 *  ──────
 *  1. מחשבים SHA-256 של ה-snapshot Base64 בנפרד (snapshotHash)
 *  2. בונים "Canonical Evidence Object" מסודר לפי מפתחות
 *  3. מחשבים SHA-256 של ה-JSON הסידורי + secret pepper
 *  4. שומרים: { eventSignature, snapshotHash, signedAt }
 *
 *  כל ה-hashing מתבצע דרך Web Crypto API (מובנה בדפדפן) —
 *  ללא ספריות צד שלישי.
 * ═══════════════════════════════════════════════════════════════
 *
 * @module forensics
 */

// pepper קבוע — ניתן לשמור ב-.env כ-VITE_FORENSIC_PEPPER
const PEPPER = import.meta.env.VITE_FORENSIC_PEPPER ?? "SVG-ASHKELON-2025";

// ══════════════════════════════════════════════════════════════════════════════
//  פונקציה ראשית: signEvent
// ══════════════════════════════════════════════════════════════════════════════

/**
 * signEvent — יוצר חתימה פורנזית לאירוע
 *
 * @param {Object} eventData
 * @param {string}        eventData.eventId     — מזהה ייחודי
 * @param {number}        eventData.confidence  — רמת ביטחון AI (0-100)
 * @param {string}        eventData.label       — 'person' וכו'
 * @param {string}        eventData.snapshotB64 — Base64 של התמונה
 * @param {string|number} eventData.timestamp   — ISO string או Unix ms
 * @param {Object}        eventData.bbox        — { x, y, w, h }
 *
 * @returns {Promise<ForensicSignature>}
 *
 * @typedef {{
 *   eventSignature: string,  — hex hash של כל האירוע
 *   snapshotHash:   string,  — hex hash של התמונה בלבד
 *   canonicalJson:  string,  — JSON שחושב ממנו ה-hash
 *   signedAt:       string,  — ISO timestamp של זמן החתימה
 *   algorithm:      'SHA-256'
 * }} ForensicSignature
 */
export async function signEvent(eventData) {
  const { eventId, confidence, label, snapshotB64, timestamp, bbox } = eventData;

  // ── שלב 1: Hash של התמונה בנפרד ────────────────────────────────────────
  const snapshotHash = snapshotB64
    ? await sha256Hex(snapshotB64)
    : "NO_SNAPSHOT";

  // ── שלב 2: Canonical Evidence Object ────────────────────────────────────
  // מפתחות מסודרים אלפביתית — מבטיח JSON זהה בכל ריצה
  const canonical = {
    bbox:         normalizeBbox(bbox),
    confidence:   Math.round(confidence * 100) / 100,  // 2 ספרות עשרוניות
    eventId,
    label,
    snapshotHash,
    timestamp:    new Date(timestamp).toISOString(),
  };

  const canonicalJson = JSON.stringify(canonical, Object.keys(canonical).sort());

  // ── שלב 3: SHA-256(canonical + pepper) ──────────────────────────────────
  const eventSignature = await sha256Hex(canonicalJson + PEPPER);

  return {
    eventSignature,
    snapshotHash,
    canonicalJson,
    signedAt:  new Date().toISOString(),
    algorithm: "SHA-256",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  אימות חתימה (לשימוש בבדיקות ובCloud Function)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * verifySignature — בודק שחתימה תואמת לנתונים
 *
 * @param {Object} eventData        — נתוני האירוע המקוריים
 * @param {string} storedSignature  — החתימה שנשמרה ב-Firestore
 * @returns {Promise<boolean>}
 */
export async function verifySignature(eventData, storedSignature) {
  const { eventSignature } = await signEvent(eventData);
  return eventSignature === storedSignature;
}

// ══════════════════════════════════════════════════════════════════════════════
//  עזרים
// ══════════════════════════════════════════════════════════════════════════════

/**
 * sha256Hex — מחשב SHA-256 ומחזיר hex string
 * משתמש ב-Web Crypto API המובנה בדפדפן
 *
 * @param {string} message
 * @returns {Promise<string>} 64-char hex string
 */
export async function sha256Hex(message) {
  const msgBuffer  = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray  = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

/** מחזיר bbox מסודר ועם ערכים מעוגלים */
function normalizeBbox(bbox) {
  if (!bbox) return null;
  return {
    h: Math.round(bbox.h ?? bbox[3] ?? 0),
    w: Math.round(bbox.w ?? bbox[2] ?? 0),
    x: Math.round(bbox.x ?? bbox[0] ?? 0),
    y: Math.round(bbox.y ?? bbox[1] ?? 0),
  };
}
