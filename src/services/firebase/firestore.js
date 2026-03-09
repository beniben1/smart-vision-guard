/**
 * @file src/services/firebase/firestore.js
 * @description שירות Firebase — Storage + Firestore
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │  uploadSnapshot()      → Firebase Storage /detections/      │
 * │  saveDetectionEvent()  → Firestore /events/ (+ AI fields)   │
 * │  subscribeToEvents()   → real-time listener                 │
 * └─────────────────────────────────────────────────────────────┘
 */

import {
  collection, addDoc, onSnapshot,
  query, orderBy, limit, serverTimestamp,
} from "firebase/firestore";
import { ref, uploadString, getDownloadURL } from "firebase/storage";
import { db, storage } from "./config";

const EVENTS_COL   = "events";
const STORAGE_PATH = "detections";

// ── 1. Upload snapshot ────────────────────────────────────────────────────────
export async function uploadSnapshot(base64DataUrl, eventId) {
  if (!base64DataUrl) throw new Error("No snapshot data");
  const storageRef = ref(storage, `${STORAGE_PATH}/${eventId}.jpg`);
  const snap       = await uploadString(storageRef, base64DataUrl, "data_url");
  const url        = await getDownloadURL(snap.ref);
  console.log(`[Storage] ✅ ${eventId}.jpg`);
  return url;
}

// ── 2. Save detection event (מקבל את כל השדות המורחבים מ-AI services) ─────────
/**
 * @param {Object} p
 * @param {number} p.confidence
 * @param {string} p.label
 * @param {string} p.snapshotUrl
 * @param {Object} p.bbox              — { x, y, w, h }
 * @param {string} [p.forensicHash]    — פיצ'ר 3: SHA-256 event signature
 * @param {string} [p.snapshotHash]    — פיצ'ר 3: SHA-256 snapshot hash
 * @param {string} [p.signedAt]        — פיצ'ר 3: ISO timestamp of signing
 * @param {boolean}[p.isReturning]     — פיצ'ר 1: Re-ID result
 * @param {number} [p.reidSimilarity]  — פיצ'ר 1: similarity %
 * @param {string} [p.matchId]         — פיצ'ר 1: matched embedding doc ID
 * @param {number} [p.qualityUsed]     — פיצ'ר 4: JPEG quality used
 * @param {string} [p.qualityReason]   — פיצ'ר 4: reason string
 * @param {string} [p.trackId]         — פיצ'ר 2: trajectory track ID
 */
export async function saveDetectionEvent({
  confidence, label, snapshotUrl, bbox,
  forensicHash, snapshotHash, signedAt,
  isReturning, reidSimilarity, matchId,
  qualityUsed, qualityReason, trackId,
}) {
  const docRef = await addDoc(collection(db, EVENTS_COL), {
    // ── Core ──────────────────────────────────────────────────────────────
    timestamp:    serverTimestamp(),
    confidence:   Math.round(confidence * 10) / 10,
    label,
    snapshotUrl:  snapshotUrl ?? null,
    bbox:         bbox ?? null,
    status:       "new",
    // ── Forensics (פיצ'ר 3) ───────────────────────────────────────────────
    forensicHash:   forensicHash  ?? null,
    snapshotHash:   snapshotHash  ?? null,
    signedAt:       signedAt      ?? null,
    // ── Re-ID (פיצ'ר 1) ───────────────────────────────────────────────────
    isReturning:    isReturning    ?? false,
    reidSimilarity: reidSimilarity ?? null,
    matchId:        matchId        ?? null,
    // ── Adaptive (פיצ'ר 4) ───────────────────────────────────────────────
    qualityUsed:    qualityUsed    ?? null,
    qualityReason:  qualityReason  ?? null,
    // ── Trajectory (פיצ'ר 2) ─────────────────────────────────────────────
    trackId:        trackId        ?? null,
  });

  console.log(`[Firestore] ✅ ${docRef.id} | ${label} ${Math.round(confidence)}%`);
  return docRef.id;
}

// ── 3. Real-time listener ─────────────────────────────────────────────────────
export function subscribeToEvents(onUpdate, maxEvents = 30) {
  const q = query(
    collection(db, EVENTS_COL),
    orderBy("timestamp", "desc"),
    limit(maxEvents)
  );
  return onSnapshot(q, snap => {
    const events = snap.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      timestamp: doc.data().timestamp?.toDate?.() ?? new Date(),
    }));
    onUpdate(events);
  }, err => console.error("[Firestore] ❌", err));
}
