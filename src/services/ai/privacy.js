/**
 * @file src/services/ai/privacy.js
 * @description פיצ'ר 5 — Privacy-Preserving Obfuscation
 *
 * ═══════════════════════════════════════════════════════════════
 *  מטרה: הצגת הפריים תוך שמירה על פרטיות הסביבה
 *
 *  שיטה: Two-Pass Canvas Rendering
 *  ─────────────────────────────────
 *  Pass 1: צייר את כל הפריים עם Blur חזק (CSS filter)
 *          → כל הסביבה מטושטשת
 *
 *  Pass 2: עבור כל bbox של אובייקט מזוהה —
 *          צייר את חתיכת הוידאו המקורית (בלי blur)
 *          על גבי הפריים המטושטש
 *
 *  תוצאה: האובייקטים המזוהים חדים, הסביבה מטושטשת
 *
 *  אפשרות נוספת: Pixelation (אפקט "פיקסלים גדולים")
 *  ──────────────────────────────────────────────────
 *  לפניים/לוחיות: שרטוט ל-canvas קטן ואז scaling up
 *  הוסף ל-bbox כ-{ pixelate: true }
 * ═══════════════════════════════════════════════════════════════
 *
 * @module privacy
 */

// ─── קבועים ──────────────────────────────────────────────────────────────────
const BLUR_AMOUNT      = 14;   // px — כמות הטשטוש לסביבה
const PIXELATE_SIZE    = 12;   // px — גודל "פיקסל" לobfuscation של פנים
const PADDING          = 8;    // px — ריפוד סביב ה-bbox לחיתוך רך

// ══════════════════════════════════════════════════════════════════════════════
//  renderPrivacyFrame — Two-Pass rendering
// ══════════════════════════════════════════════════════════════════════════════

/**
 * renderPrivacyFrame — מצייר פריים עם obfuscation על canvas יעד
 *
 * @param {HTMLVideoElement}          video     — מקור הוידאו
 * @param {HTMLCanvasElement}         dstCanvas — canvas יעד (מעל הvideo)
 * @param {Array<{ x,y,w,h, pixelate?: boolean }>} bboxes — אזורים לחשיפה
 * @param {boolean} enabled — האם obfuscation פעיל (false → pass-through)
 */
export function renderPrivacyFrame(video, dstCanvas, bboxes, enabled) {
  if (!video || video.readyState < 2 || !dstCanvas) return;

  const W   = video.videoWidth  || 640;
  const H   = video.videoHeight || 480;
  const ctx = dstCanvas.getContext("2d");
  dstCanvas.width  = W;
  dstCanvas.height = H;

  if (!enabled || !bboxes || bboxes.length === 0) {
    // מצב רגיל — רק clear (ה-video מוצג מתחת)
    ctx.clearRect(0, 0, W, H);
    return;
  }

  // ── Pass 1: פריים מלא עם blur ─────────────────────────────────────────────
  ctx.save();
  ctx.filter = `blur(${BLUR_AMOUNT}px)`;
  ctx.drawImage(video, 0, 0, W, H);
  ctx.restore(); // מחזיר filter ל-none

  // ── Pass 2: חשיפת אזורי ה-bbox בחדות מקורית ─────────────────────────────
  bboxes.forEach(bbox => {
    const x = Math.max(0, (bbox.x ?? bbox[0]) - PADDING);
    const y = Math.max(0, (bbox.y ?? bbox[1]) - PADDING);
    const w = Math.min(W - x, (bbox.w ?? bbox[2]) + PADDING * 2);
    const h = Math.min(H - y, (bbox.h ?? bbox[3]) + PADDING * 2);

    if (w <= 0 || h <= 0) return;

    if (bbox.pixelate) {
      // Pixelation — לפנים, לוחיות רכב, וכו'
      drawPixelated(ctx, video, x, y, w, h);
    } else {
      // חשיפה ישירה — האובייקט חד
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = "none";
      ctx.drawImage(video, 0, 0, W, H);
      ctx.restore();
    }
  });

  // ── Pass 3: גבולות עדינים סביב האזורים החשופים ───────────────────────────
  bboxes.forEach(bbox => {
    const x = Math.max(0, (bbox.x ?? bbox[0]) - PADDING);
    const y = Math.max(0, (bbox.y ?? bbox[1]) - PADDING);
    const w = Math.min(W - x, (bbox.w ?? bbox[2]) + PADDING * 2);
    const h = Math.min(H - y, (bbox.h ?? bbox[3]) + PADDING * 2);
    if (w <= 0 || h <= 0) return;

    ctx.strokeStyle = "rgba(0,229,255,0.3)";
    ctx.lineWidth   = 1;
    ctx.setLineDash([3, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  });

  // ── Watermark ─────────────────────────────────────────────────────────────
  drawPrivacyWatermark(ctx, W, H);
}

// ══════════════════════════════════════════════════════════════════════════════
//  Pixelation של אזור ספציפי
// ══════════════════════════════════════════════════════════════════════════════

/**
 * drawPixelated — מצייר אזור מ-source בפיקסלציה גסה
 *
 * @param {CanvasRenderingContext2D}         ctx
 * @param {HTMLVideoElement|HTMLCanvasElement} source
 * @param {number} x, y, w, h — אזור להצגה
 */
function drawPixelated(ctx, source, x, y, w, h) {
  const ps = PIXELATE_SIZE;

  // שרטוט ל-canvas קטן (blur אמיתי)
  const tmpC = document.createElement("canvas");
  tmpC.width  = Math.max(1, Math.floor(w / ps));
  tmpC.height = Math.max(1, Math.floor(h / ps));
  tmpC.getContext("2d").drawImage(source, x, y, w, h, 0, 0, tmpC.width, tmpC.height);

  // Scaling בחזרה — יוצר אפקט פיקסלים גדולים
  ctx.save();
  ctx.imageSmoothingEnabled = false;  // מניעת antialiasing
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.drawImage(tmpC, 0, 0, tmpC.width, tmpC.height, x, y, w, h);
  ctx.restore();
}

// ── Watermark ─────────────────────────────────────────────────────────────────
function drawPrivacyWatermark(ctx, W, H) {
  ctx.font      = "9px monospace";
  ctx.fillStyle = "rgba(0,229,255,0.18)";
  ctx.fillText("PRIVACY MODE ACTIVE · Smart-Vision Guard", 10, H - 8);
}

// ══════════════════════════════════════════════════════════════════════════════
//  Snapshot עם obfuscation — לשמירה ב-Storage
// ══════════════════════════════════════════════════════════════════════════════

/**
 * capturePrivacySnapshot — מחזיר Base64 של הפריים עם obfuscation
 * משמש לשליחה ל-Firebase Storage (תמונה מטושטשת לסביבה)
 *
 * @param {HTMLVideoElement}  video
 * @param {Array<{x,y,w,h}>} bboxes
 * @param {number}            quality — JPEG quality
 * @returns {string} Base64 data URL
 */
export function capturePrivacySnapshot(video, bboxes, quality = 0.82) {
  try {
    const W = video.videoWidth  || 640;
    const H = video.videoHeight || 480;

    const offscreen = document.createElement("canvas");
    offscreen.width  = W;
    offscreen.height = H;

    renderPrivacyFrame(video, offscreen, bboxes, true);

    // צייר את ה-bboxes (rendering) על ה-offscreen
    const ctx = offscreen.getContext("2d");

    // Pass 1: blur
    ctx.save();
    ctx.filter = `blur(${BLUR_AMOUNT}px)`;
    ctx.drawImage(video, 0, 0, W, H);
    ctx.restore();

    // Pass 2: חשוף bboxes
    bboxes.forEach(bbox => {
      const x = Math.max(0, (bbox.x ?? bbox[0]) - PADDING);
      const y = Math.max(0, (bbox.y ?? bbox[1]) - PADDING);
      const w = Math.min(W - x, (bbox.w ?? bbox[2]) + PADDING * 2);
      const h = Math.min(H - y, (bbox.h ?? bbox[3]) + PADDING * 2);
      if (w <= 0 || h <= 0) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.filter = "none";
      ctx.drawImage(video, 0, 0, W, H);
      ctx.restore();
    });

    drawPrivacyWatermark(ctx, W, H);
    return offscreen.toDataURL("image/jpeg", quality);

  } catch (err) {
    console.error("[Privacy] ❌ Snapshot failed:", err.message);
    return "";
  }
}
