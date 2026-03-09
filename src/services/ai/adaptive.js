/**
 * @file src/services/ai/adaptive.js
 * @description פיצ'ר 4 — Adaptive Data Transmission
 *
 * ═══════════════════════════════════════════════════════════════
 *  שתי ה-inputs שמשפיעות על איכות ה-JPEG הנשלח:
 *
 *  א. Image Entropy של ה-BBox
 *     ─────────────────────────
 *     Shannon Entropy: H = -Σ p(i) * log2(p(i))
 *     מחושב על היסטוגרמת בהירות (256 bins) של פיקסלי ה-bbox.
 *
 *     Entropy נמוכה (0-2) → תמונה חלקה/אחידה (רקע, קיר) → איכות נמוכה
 *     Entropy גבוהה (5-8) → תמונה מורכבת (אדם, פרטים) → איכות גבוהה
 *
 *     למה? אין טעם לשלוח 90% JPEG על bbox שהוא קיר לבן.
 *
 *  ב. Network Quality
 *     ──────────────────
 *     navigator.connection.effectiveType: '4g' | '3g' | '2g' | 'slow-2g'
 *     navigator.connection.downlink:      Mbps
 *
 *     נכס fallback: אם ה-API לא זמין (Firefox, Safari) → default quality
 *
 *  פלט: quality ∈ [0.35, 0.95] — מועבר ל-canvas.toDataURL("image/jpeg", q)
 * ═══════════════════════════════════════════════════════════════
 *
 * @module adaptive
 */

// ─── קבועים ──────────────────────────────────────────────────────────────────
const QUALITY_MIN     = 0.35;  // רשת גרועה + entropy נמוכה
const QUALITY_MAX     = 0.95;  // רשת מצוינת + entropy גבוהה
const QUALITY_DEFAULT = 0.72;  // fallback כשאין נתוני רשת

// ══════════════════════════════════════════════════════════════════════════════
//  פונקציה ראשית: computeAdaptiveQuality
// ══════════════════════════════════════════════════════════════════════════════

/**
 * computeAdaptiveQuality — מחשב איכות JPEG אופטימלית
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} source — מקור הפריים
 * @param {{ x, y, w, h }} bbox                       — אזור האובייקט
 * @returns {{ quality: number, entropyScore: number, networkScore: number, reason: string }}
 */
export function computeAdaptiveQuality(source, bbox) {
  // ── שלב 1: חשב Entropy ───────────────────────────────────────────────────
  const entropyResult = computeBboxEntropy(source, bbox);

  // ── שלב 2: קבל מצב רשת ──────────────────────────────────────────────────
  const networkResult = getNetworkQuality();

  // ── שלב 3: שלב את שני המדדים (Weighted Average) ─────────────────────────
  // Entropy משפיע 60%, רשת משפיעה 40%
  const combined = entropyResult.score * 0.60 + networkResult.score * 0.40;
  const quality  = clamp(QUALITY_MIN + combined * (QUALITY_MAX - QUALITY_MIN), QUALITY_MIN, QUALITY_MAX);

  const reason = buildReason(entropyResult, networkResult, quality);

  console.log(`[Adaptive] 📊 Entropy: ${entropyResult.value.toFixed(2)} bits | ` +
              `Network: ${networkResult.type} | Quality: ${Math.round(quality * 100)}%`);

  return {
    quality:      Math.round(quality * 100) / 100,
    entropyScore: entropyResult.score,
    networkScore: networkResult.score,
    entropyBits:  entropyResult.value,
    networkType:  networkResult.type,
    reason,
  };
}

// ══════════════════════════════════════════════════════════════════════════════
//  Shannon Entropy
// ══════════════════════════════════════════════════════════════════════════════

/**
 * computeBboxEntropy — מחשב Shannon Entropy על פיקסלי ה-bbox
 *
 * @param {HTMLVideoElement|HTMLCanvasElement} source
 * @param {{ x, y, w, h }} bbox
 * @returns {{ value: number, score: number }}
 *   value — entropy בביטים (0–8)
 *   score — ערך נורמלי [0,1]
 */
function computeBboxEntropy(source, bbox) {
  try {
    const { x, y, w, h } = bbox;
    if (w <= 0 || h <= 0) return { value: 4, score: 0.5 };

    // sample ב-resolution נמוך לביצועים
    const SAMPLE_W = Math.min(w, 64);
    const SAMPLE_H = Math.min(h, 64);

    const tmp = document.createElement("canvas");
    tmp.width  = SAMPLE_W;
    tmp.height = SAMPLE_H;
    tmp.getContext("2d").drawImage(source, x, y, w, h, 0, 0, SAMPLE_W, SAMPLE_H);

    const { data } = tmp.getContext("2d").getImageData(0, 0, SAMPLE_W, SAMPLE_H);
    const totalPx  = SAMPLE_W * SAMPLE_H;

    // היסטוגרמת בהירות (Luma) — 256 bins
    const hist = new Uint32Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      // ITU-R BT.601 Luma
      const luma = Math.round(0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2]);
      hist[luma]++;
    }

    // Shannon Entropy: H = -Σ p(i) * log2(p(i))
    let entropy = 0;
    for (let i = 0; i < 256; i++) {
      if (hist[i] === 0) continue;
      const p = hist[i] / totalPx;
      entropy -= p * Math.log2(p);
    }

    // Entropy בתמונות אמיתיות: ~2–7 bits
    // normalize: 0 bits → score=0; 7+ bits → score=1
    const score = clamp(entropy / 7, 0, 1);
    return { value: entropy, score };

  } catch {
    return { value: 4, score: 0.5 };  // fallback
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  Network Quality Detection
// ══════════════════════════════════════════════════════════════════════════════

/**
 * getNetworkQuality — מחזיר מדד רשת מ-Network Information API
 *
 * @returns {{ score: number, type: string }}
 */
function getNetworkQuality() {
  try {
    const conn = navigator.connection ||
                 navigator.mozConnection ||
                 navigator.webkitConnection;

    if (!conn) return { score: 0.7, type: "unknown" };

    // effectiveType: מדד מבוסס RTT + throughput
    const typeScore = {
      "4g":      1.0,
      "3g":      0.65,
      "2g":      0.35,
      "slow-2g": 0.15,
    }[conn.effectiveType] ?? 0.7;

    // downlink (Mbps) — ממד נוסף אם זמין
    const dlScore = conn.downlink
      ? clamp(conn.downlink / 10, 0, 1)  // 10 Mbps → score=1
      : typeScore;

    const score = (typeScore * 0.6 + dlScore * 0.4);
    return { score, type: conn.effectiveType ?? "unknown" };

  } catch {
    return { score: 0.7, type: "unknown" };
  }
}

// ─── עזרים ───────────────────────────────────────────────────────────────────
function clamp(v, min, max) { return Math.min(Math.max(v, min), max); }

function buildReason({ value, score: es }, { type, score: ns }, quality) {
  const entropyDesc = es > 0.7 ? "high" : es > 0.4 ? "medium" : "low";
  const netDesc     = ns > 0.7 ? "good"  : ns > 0.4 ? "fair"   : "poor";
  return `entropy:${entropyDesc}(${value.toFixed(1)}b) net:${netDesc}(${type}) → quality:${Math.round(quality*100)}%`;
}
