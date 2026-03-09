/**
 * @file src/hooks/useDetection.js
 * @description Orchestrator Hook — מאחד את כל 5 שירותי ה-AI
 *
 * Clean Architecture:
 *   useDetection (Hook)
 *     ├── embeddings.js  → Visual Re-ID
 *     ├── trajectory.js  → Predictive Breach
 *     ├── forensics.js   → SHA-256 Signing
 *     ├── adaptive.js    → Quality Optimization
 *     ├── privacy.js     → Obfuscation
 *     └── firestore.js   → Persistence
 */

import { useState, useEffect, useRef, useCallback } from "react";
import * as tf      from "@tensorflow/tfjs";
import * as cocoSsd from "@tensorflow-models/coco-ssd";

import { extractEmbedding, checkReturningVisitor, saveEmbedding }
  from "../services/ai/embeddings";
import { ObjectTracker, checkPredictiveBreach,
         drawTrajectory, drawForbiddenZone }
  from "../services/ai/trajectory";
import { signEvent }                 from "../services/ai/forensics";
import { computeAdaptiveQuality }    from "../services/ai/adaptive";
import { renderPrivacyFrame, capturePrivacySnapshot }
  from "../services/ai/privacy";
import { uploadSnapshot, saveDetectionEvent }
  from "../services/firebase/firestore";

const ALARM_LABEL     = "person";
const DEFAULT_COOL    = 8_000;
const INTRUDER_LINGER = 2_500;
const BREACH_LINGER   = 3_000;

// ─── Audio ────────────────────────────────────────────────────────────────────
function playAlertSound(type = "alarm") {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = type === "breach"
      ? [{ f:660,t:0.00,d:0.08 },{ f:880,t:0.10,d:0.08 },{ f:1100,t:0.20,d:0.08 },{ f:880,t:0.30,d:0.16 }]
      : [{ f:880,t:0.00,d:0.13 },{ f:1100,t:0.17,d:0.13 },{ f:880,t:0.34,d:0.13 },{ f:1320,t:0.51,d:0.18 }];
    notes.forEach(({ f, t, d }) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "square";
      osc.frequency.setValueAtTime(f, ctx.currentTime + t);
      gain.gain.setValueAtTime(0, ctx.currentTime + t);
      gain.gain.linearRampToValueAtTime(0.14, ctx.currentTime + t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + d);
      osc.start(ctx.currentTime + t);
      osc.stop(ctx.currentTime + t + d + 0.05);
    });
    setTimeout(() => ctx.close().catch(() => {}), 2_000);
  } catch { /* silent */ }
}

// ─── Bounding Box Drawing ─────────────────────────────────────────────────────
function drawBBox(ctx, [x,y,w,h], label, score, isPerson, isBreach) {
  const color = isBreach ? "#ff6600" : isPerson ? "#ff2020" : "#00e5ff";
  const L = 16;
  ctx.strokeStyle = color + (isPerson ? "dd" : "66");
  ctx.lineWidth   = isPerson ? 2.5 : 1.5;
  ctx.setLineDash(isPerson ? [] : [5,4]);
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.strokeStyle = color; ctx.lineWidth = 2.5;
  [[x,y,[L,0,0,L]],[x+w,y,[-L,0,0,L]],[x,y+h,[L,0,0,-L]],[x+w,y+h,[-L,0,0,-L]]]
    .forEach(([cx,cy,[ax,ay,bx,by]]) => {
      ctx.beginPath(); ctx.moveTo(cx+ax,cy+ay); ctx.lineTo(cx,cy); ctx.lineTo(cx+bx,cy+by); ctx.stroke();
    });
  const tag = isBreach ? `⚡ BREACH  ${Math.round(score*100)}%`
            : isPerson ? `⚠ PERSON  ${Math.round(score*100)}%`
            : `${label}  ${Math.round(score*100)}%`;
  ctx.font = `bold ${isPerson ? 13 : 11}px monospace`;
  const tw = ctx.measureText(tag).width;
  ctx.fillStyle = color + "bb"; ctx.fillRect(x, y-26, tw+14, 26);
  ctx.fillStyle = "#fff"; ctx.fillText(tag, x+7, y-8);
}

function captureFrame(video, quality = 0.82) {
  try {
    const c = document.createElement("canvas");
    c.width = video.videoWidth || 640; c.height = video.videoHeight || 480;
    c.getContext("2d").drawImage(video, 0, 0);
    return c.toDataURL("image/jpeg", quality);
  } catch { return ""; }
}

// ══════════════════════════════════════════════════════════════════════════════
export function useDetection({
  isArmed, privacyMode = true, cameraActive,
  videoRef, canvasRef, privacyCanvasRef,
  minConfidence = 0.75, cooldownMs = DEFAULT_COOL,
  audioEnabled = true, forbiddenZone = null,
  onIntruderDetected, onBreachDetected,
}) {
  const [modelLoaded,    setModelLoaded]    = useState(false);
  const [fps,            setFps]            = useState(0);
  const [detections,     setDetections]     = useState([]);
  const [uploadStatus,   setUploadStatus]   = useState("idle");
  const [intruderActive, setIntruderActive] = useState(false);
  const [breachActive,   setBreachActive]   = useState(false);
  const [lastReID,       setLastReID]       = useState(null);
  const [lastSignature,  setLastSignature]  = useState(null);
  const [lastQualityInfo,setLastQualityInfo]= useState(null);

  const modelRef   = useRef(null);
  const trackerRef = useRef(new ObjectTracker());
  const rafRef     = useRef(null);
  const lastEvRef  = useRef(0);
  const intTimRef  = useRef(null);
  const breTimRef  = useRef(null);
  const fpsRef     = useRef(0);
  const fpsIntRef  = useRef(null);
  const uploadRef  = useRef(false);

  // Live refs
  const minCR = useRef(minConfidence); useEffect(() => { minCR.current = minConfidence; }, [minConfidence]);
  const armR  = useRef(isArmed);       useEffect(() => { armR.current  = isArmed;       }, [isArmed]);
  const audR  = useRef(audioEnabled);  useEffect(() => { audR.current  = audioEnabled;  }, [audioEnabled]);
  const zoneR = useRef(forbiddenZone); useEffect(() => { zoneR.current = forbiddenZone; }, [forbiddenZone]);
  const privR = useRef(privacyMode);   useEffect(() => { privR.current = privacyMode;   }, [privacyMode]);

  // ── Model load ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await tf.setBackend("webgl"); await tf.ready();
        const model = await cocoSsd.load({ base: "lite_mobilenet_v2" });
        if (!cancelled) { modelRef.current = model; setModelLoaded(true);
          console.log(`[AI] ✅ COCO-SSD ready · ${tf.getBackend()}`); }
      } catch (e) { console.error("[AI] ❌", e.message); }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Fire Event ──────────────────────────────────────────────────────────────
  const fireEvent = useCallback(async ({ score, bbox, allBboxes, track }) => {
    if (uploadRef.current) return;
    uploadRef.current = true;
    const video = videoRef.current;
    const confidence = score * 100;
    const eventId = `det_${Date.now()}`;
    const timestamp = new Date().toISOString();

    if (audR.current) playAlertSound("alarm");
    onIntruderDetected?.({ confidence, bbox });

    if (!armR.current) {
      console.log(`[Detection] 🔕 DISARMED | ${Math.round(confidence)}%`);
      uploadRef.current = false; return;
    }

    try {
      setUploadStatus("uploading");

      // 1. Re-ID (פיצ'ר 1)
      const embedding = extractEmbedding(video, bbox,
        { width: video.videoWidth, height: video.videoHeight });
      const reID = await checkReturningVisitor(embedding);
      setLastReID(reID);
      await saveEmbedding(embedding, eventId);

      // 2. Adaptive Quality (פיצ'ר 4)
      const qInfo = computeAdaptiveQuality(video, bbox);
      setLastQualityInfo(qInfo);

      // 3. Privacy Snapshot (פיצ'ר 5)
      const snapshotB64 = privR.current
        ? capturePrivacySnapshot(video, allBboxes, qInfo.quality)
        : captureFrame(video, qInfo.quality);

      // 4. Forensic Sign (פיצ'ר 3)
      const forensic = await signEvent({ eventId, confidence, label: ALARM_LABEL,
        snapshotB64, timestamp,
        bbox: { x: bbox.x??bbox[0], y: bbox.y??bbox[1], w: bbox.w??bbox[2], h: bbox.h??bbox[3] }
      });
      setLastSignature(forensic.eventSignature.slice(0, 16) + "...");

      // 5. Firebase
      const snapshotUrl = await uploadSnapshot(snapshotB64, eventId);
      await saveDetectionEvent({
        confidence, label: ALARM_LABEL, snapshotUrl,
        bbox: { x: Math.round(bbox.x??bbox[0]), y: Math.round(bbox.y??bbox[1]),
                w: Math.round(bbox.w??bbox[2]), h: Math.round(bbox.h??bbox[3]) },
        forensicHash: forensic.eventSignature,
        snapshotHash: forensic.snapshotHash,
        signedAt: forensic.signedAt,
        isReturning: reID.isReturning, reidSimilarity: reID.similarity,
        qualityUsed: qInfo.quality, qualityReason: qInfo.reason,
        trackId: track?.id ?? null,
      });

      setUploadStatus("done");
      setTimeout(() => setUploadStatus("idle"), 3_000);
    } catch (err) {
      console.error("[Detection] ❌", err.message);
      setUploadStatus("error");
      setTimeout(() => setUploadStatus("idle"), 5_000);
    }
    uploadRef.current = false;
  }, [videoRef, onIntruderDetected]);

  // ── Fire Breach ─────────────────────────────────────────────────────────────
  const fireBreach = useCallback(({ track, framesUntilEntry }) => {
    setBreachActive(true);
    if (audR.current) playAlertSound("breach");
    clearTimeout(breTimRef.current);
    breTimRef.current = setTimeout(() => setBreachActive(false), BREACH_LINGER);
    onBreachDetected?.({ track, framesUntilEntry });
    console.log(`[Trajectory] 🚨 PREDICTIVE BREACH | ${track.id} | ETA: ${framesUntilEntry}f`);
  }, [onBreachDetected]);

  // ── Detection Loop ──────────────────────────────────────────────────────────
  const loop = useCallback(async () => {
    const video = videoRef.current, canvas = canvasRef.current, model = modelRef.current;
    if (!video || video.readyState < 2 || !canvas || !model) {
      rafRef.current = requestAnimationFrame(loop); return;
    }

    let preds = [];
    try { preds = await model.detect(video); }
    catch { rafRef.current = requestAnimationFrame(loop); return; }

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const passing = preds.filter(p => p.score >= minCR.current);
    const bboxes  = passing.map(p => ({ x:p.bbox[0], y:p.bbox[1], w:p.bbox[2], h:p.bbox[3] }));
    const tracked = trackerRef.current.update(bboxes);
    setDetections(passing);

    const zone = zoneR.current;
    drawForbiddenZone(ctx, zone, false);

    let personVisible = false;
    const personBboxes = [];

    tracked.forEach(({ bbox, track }) => {
      const pred = passing.find(p => Math.abs(p.bbox[0]-bbox.x) < 5 && Math.abs(p.bbox[1]-bbox.y) < 5);
      if (!pred) return;
      const { class: label, score } = pred;
      const isPerson = label === ALARM_LABEL;
      let isBreach = false;

      if (isPerson && zone) {
        const res = checkPredictiveBreach(track, zone);
        if (res.breach) {
          isBreach = true;
          drawForbiddenZone(ctx, zone, true);
          fireBreach({ track, framesUntilEntry: res.framesUntilEntry });
        }
        drawTrajectory(ctx, track, isBreach);
      }

      drawBBox(ctx, [bbox.x, bbox.y, bbox.w, bbox.h], label, score, isPerson, isBreach);

      if (isPerson) {
        personVisible = true;
        personBboxes.push({ x:bbox.x, y:bbox.y, w:bbox.w, h:bbox.h });
        const now = Date.now();
        if (now - lastEvRef.current > cooldownMs) {
          lastEvRef.current = now;
          fireEvent({ score, bbox, allBboxes: personBboxes, track });
        }
      }
    });

    // Privacy obfuscation (פיצ'ר 5)
    if (privR.current) {
      renderPrivacyFrame(video, privacyCanvasRef?.current, personBboxes, true);
    }

    if (personVisible) {
      setIntruderActive(true);
      clearTimeout(intTimRef.current);
      intTimRef.current = setTimeout(() => setIntruderActive(false), INTRUDER_LINGER);
    }

    fpsRef.current++;
    rafRef.current = requestAnimationFrame(loop);
  }, [videoRef, canvasRef, privacyCanvasRef, cooldownMs, fireEvent, fireBreach]);

  // ── Start / Stop ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraActive || !modelLoaded) {
      cancelAnimationFrame(rafRef.current);
      clearInterval(fpsIntRef.current);
      clearTimeout(intTimRef.current);
      clearTimeout(breTimRef.current);
      trackerRef.current.reset();
      setDetections([]); setFps(0);
      setIntruderActive(false); setBreachActive(false);
      return;
    }
    rafRef.current  = requestAnimationFrame(loop);
    fpsIntRef.current = setInterval(() => {
      setFps(fpsRef.current); fpsRef.current = 0;
    }, 1_000);
    return () => { cancelAnimationFrame(rafRef.current); clearInterval(fpsIntRef.current); };
  }, [cameraActive, modelLoaded, loop]);

  return { modelLoaded, fps, detections, uploadStatus,
           intruderActive, breachActive, lastReID, lastSignature, lastQualityInfo };
}
