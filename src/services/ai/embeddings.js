/**
 * @file src/services/ai/embeddings.js
 * @description פיצ'ר 1 — Visual Embedding & Re-Identification
 *
 * ═══════════════════════════════════════════════════════════════
 *  עיקרון עבודה:
 *  ─────────────
 *  במקום זיהוי פנים (אסור מבחינת פרטיות), אנחנו מחלצים
 *  "חתימה מתמטית" של האובייקט מ-3 מקורות:
 *
 *  1. HSV Color Histogram (48 ערכים)
 *     ─ מחלקים את ה-Hue לـ 16 bins, Saturation ל-4, Value ל-4
 *     ─ יחסית עמיד לשינויי תאורה קלים
 *     ─ לא ניתן לשחזר פנים ממנו (Privacy-Safe)
 *
 *  2. Aspect Ratio + Relative Position (3 ערכים)
 *     ─ height/width, bbox_center_x/frame_w, bbox_center_y/frame_h
 *
 *  3. L2-Normalized Vector (51 ערכים סה"כ)
 *     ─ normalization מאפשר Cosine Similarity = Dot Product
 *
 *  Cosine Similarity > REID_THRESHOLD → "Returning Visitor"
 * ═══════════════════════════════════════════════════════════════
 *
 * @module embeddings
 */

import { db }        from "../firebase/config";
import {
  collection, addDoc, getDocs,
  query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";

// ─── קבועים ──────────────────────────────────────────────────────────────────
const HUE_BINS        = 16;   // חלוקת ספקטרום הצבע
const SAT_BINS        = 4;    // רוויה
const VAL_BINS        = 4;    // בהירות
const EMBEDDING_DIM   = HUE_BINS + SAT_BINS + VAL_BINS + 3; // = 51
const REID_THRESHOLD  = 0.88; // סף דמיון לקביעת "Returning Visitor"
const REID_COLLECTION = "embeddings";
const MAX_COMPARE     = 50;   // כמה embeddings אחרונים להשוות

// ══════════════════════════════════════════════════════════════════════════════
//  שלב 1: חילוץ Embedding מה-Canvas
// ══════════════════════════════════════════════════════════════════════════════

/**
 * extractEmbedding — מחלץ וקטור זהות מ-bounding box
 *
 * @param {HTMLCanvasElement|HTMLVideoElement} source — מקור הפריים
 * @param {{ x, y, w, h }} bbox                       — אזור האובייקט
 * @param {{ width, height }} frameDims               — גודל הפריים המלא
 * @returns {Float32Array} וקטור נורמלי באורך EMBEDDING_DIM
 */
export function extractEmbedding(source, bbox, frameDims) {
  const { x, y, w, h } = bbox;

  // ── צייר את ה-bbox על canvas זמני ────────────────────────────────────────
  const tmpCanvas  = document.createElement("canvas");
  // דגם ב-32x64 (aspect מאפשר שימור פרופורציות גוף)
  tmpCanvas.width  = 32;
  tmpCanvas.height = 64;
  const ctx = tmpCanvas.getContext("2d");
  ctx.drawImage(source, x, y, w, h, 0, 0, 32, 64);

  const { data } = ctx.getImageData(0, 0, 32, 64); // RGBA flat array
  const totalPixels = 32 * 64;

  // ── בנה היסטוגרמות HSV ───────────────────────────────────────────────────
  const hueHist = new Float32Array(HUE_BINS).fill(0);
  const satHist = new Float32Array(SAT_BINS).fill(0);
  const valHist = new Float32Array(VAL_BINS).fill(0);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] / 255;
    const g = data[i + 1] / 255;
    const b = data[i + 2] / 255;

    const { h: hue, s: sat, v: val } = rgbToHsv(r, g, b);

    hueHist[Math.min(Math.floor(hue * HUE_BINS), HUE_BINS - 1)] += 1;
    satHist[Math.min(Math.floor(sat * SAT_BINS), SAT_BINS - 1)] += 1;
    valHist[Math.min(Math.floor(val * VAL_BINS), VAL_BINS - 1)] += 1;
  }

  // Normalize histograms (sum → 1)
  normalize1D(hueHist, totalPixels);
  normalize1D(satHist, totalPixels);
  normalize1D(valHist, totalPixels);

  // ── פיצ'רים גיאומטריים (normalized לטווח [0,1]) ──────────────────────────
  const aspectRatio   = w / Math.max(h, 1);              // יחס גובה/רוחב
  const centerX       = (x + w / 2) / (frameDims.width  || 640);
  const centerY       = (y + h / 2) / (frameDims.height || 480);

  // ── שרשור ל-וקטור מלא ───────────────────────────────────────────────────
  const embedding = new Float32Array(EMBEDDING_DIM);
  embedding.set(hueHist, 0);
  embedding.set(satHist, HUE_BINS);
  embedding.set(valHist, HUE_BINS + SAT_BINS);
  embedding[HUE_BINS + SAT_BINS + VAL_BINS]     = aspectRatio;
  embedding[HUE_BINS + SAT_BINS + VAL_BINS + 1] = centerX;
  embedding[HUE_BINS + SAT_BINS + VAL_BINS + 2] = centerY;

  // L2-Normalize → מאפשר Cosine Similarity = Dot Product
  return l2Normalize(embedding);
}

// ══════════════════════════════════════════════════════════════════════════════
//  שלב 2: Cosine Similarity
// ══════════════════════════════════════════════════════════════════════════════

/**
 * cosineSimilarity — מחשב דמיון בין שני וקטורים נורמלים
 * מכיוון שהוקטורים L2-Normalized → cosine similarity = dot product
 *
 * @param {Float32Array} a
 * @param {Float32Array} b
 * @returns {number} ערך בין -1 ל-1 (1 = זהה לחלוטין)
 */
export function cosineSimilarity(a, b) {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // כבר normalized
}

// ══════════════════════════════════════════════════════════════════════════════
//  שלב 3: Re-ID — האם מדובר ב-Returning Visitor?
// ══════════════════════════════════════════════════════════════════════════════

/**
 * checkReturningVisitor — משווה embedding חדש למאגר ב-Firestore
 *
 * @param {Float32Array} newEmbedding — הוקטור של הזיהוי הנוכחי
 * @returns {Promise<{
 *   isReturning:  boolean,
 *   similarity:   number,
 *   matchId:      string | null
 * }>}
 */
export async function checkReturningVisitor(newEmbedding) {
  try {
    const q    = query(
      collection(db, REID_COLLECTION),
      orderBy("timestamp", "desc"),
      limit(MAX_COMPARE)
    );
    const snap = await getDocs(q);

    let bestSim  = 0;
    let matchId  = null;

    snap.docs.forEach(doc => {
      const stored = new Float32Array(doc.data().embedding);
      const sim    = cosineSimilarity(newEmbedding, stored);
      if (sim > bestSim) { bestSim = sim; matchId = doc.id; }
    });

    return {
      isReturning: bestSim >= REID_THRESHOLD,
      similarity:  Math.round(bestSim * 1000) / 10, // אחוזים עם עשרון אחד
      matchId:     bestSim >= REID_THRESHOLD ? matchId : null,
    };
  } catch (err) {
    console.error("[ReID] ❌ Compare failed:", err.message);
    return { isReturning: false, similarity: 0, matchId: null };
  }
}

/**
 * saveEmbedding — שומר embedding ב-Firestore לשימוש עתידי ב-Re-ID
 *
 * @param {Float32Array} embedding
 * @param {string}       eventId  — מזהה האירוע המקורי
 * @returns {Promise<string>} document ID
 */
export async function saveEmbedding(embedding, eventId) {
  const docRef = await addDoc(collection(db, REID_COLLECTION), {
    embedding:  Array.from(embedding),  // Firestore לא תומך ב-TypedArray
    eventId,
    timestamp:  serverTimestamp(),
  });
  return docRef.id;
}

// ══════════════════════════════════════════════════════════════════════════════
//  עזרי מתמטיקה
// ══════════════════════════════════════════════════════════════════════════════

/** RGB → HSV (ערכים 0-1) */
function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function normalize1D(arr, sum) {
  for (let i = 0; i < arr.length; i++) arr[i] /= sum || 1;
}

function l2Normalize(vec) {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}
