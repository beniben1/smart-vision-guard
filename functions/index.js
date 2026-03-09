/**
 * @file functions/index.js
 * @description Firebase Cloud Functions — גרסה מלאה
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │  פונקציה 1: onNewDetectionEvent                         │
 * │    Trigger: Firestore onDocumentCreated (events/*)       │
 * │    פעולה: שליחת WhatsApp דרך Twilio                     │
 * │                                                         │
 * │  פונקציה 2: scheduledCleanup                            │
 * │    Trigger: Cron — כל יום בחצות                         │
 * │    פעולה: מחיקת מסמכים + קבצי Storage ישנים מ-7 ימים   │
 * │                                                         │
 * │  פונקציה 3: getSystemStats                              │
 * │    Trigger: HTTP GET                                     │
 * │    פעולה: מחזיר סטטיסטיקות JSON מ-Firestore             │
 * └─────────────────────────────────────────────────────────┘
 */

const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const twilio = require("twilio");

admin.initializeApp();

const db = admin.firestore();
const bucket = admin.storage().bucket();

// ─── Secrets (set via: firebase functions:secrets:set SECRET_NAME) ───────────
const TWILIO_ACCOUNT_SID = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_TO_NUMBER = defineSecret("TWILIO_TO_NUMBER");   // e.g. whatsapp:+1234567890
const TWILIO_FROM_NUMBER = defineSecret("TWILIO_FROM_NUMBER"); // your Twilio sandbox/number
const EVENTS_COL = "events";
const CLEANUP_DAYS = 7;

// ══════════════════════════════════════════════════════════════════════════════
//  פונקציה 1 — WhatsApp Alert
// ══════════════════════════════════════════════════════════════════════════════
exports.onNewDetectionEvent = onDocumentCreated(
  {
    document: `${EVENTS_COL}/{eventId}`,
    secrets: [TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_TO_NUMBER, TWILIO_FROM_NUMBER],
    region: "europe-west1",
    timeoutSeconds: 30,
    memory: "256MiB",
  },
  async (event) => {
    const snap = event.data;
    const eventId = event.params.eventId;
    const data = snap.data();

    if (data.label !== "person") {
      console.log(`[WhatsApp] ⏭️  Skipped — label: "${data.label}"`);
      return null;
    }

    const confidence = data.confidence ?? 0;
    const snapshotUrl = data.snapshotUrl ?? null;
    const timestamp = data.timestamp?.toDate?.() ?? new Date();
    const timeStr = timestamp.toLocaleTimeString("he-IL", {
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });

    try {
      const client = twilio(TWILIO_ACCOUNT_SID.value(), TWILIO_AUTH_TOKEN.value());
      const payload = {
        from: TWILIO_FROM_NUMBER.value(),
        to: TWILIO_TO_NUMBER.value(),
        body: `🚨 Smart-Vision Guard — Person Detected!\n\n🕐 ${timeStr}  |  🎯 ${Math.round(confidence)}%\n\n${snapshotUrl ? `📸 Snapshot: ${snapshotUrl}` : "(no snapshot)"}`,
      };
      if (snapshotUrl) payload.mediaUrl = [snapshotUrl];

      const msg = await client.messages.create(payload);
      console.log(`[WhatsApp] ✅ Sent | SID: ${msg.sid} | Event: ${eventId}`);

      await snap.ref.update({
        status: "notified",
        twilioSid: msg.sid,
        notifiedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (err) {
      console.error("[WhatsApp] ❌", err.message);
      await snap.ref.update({ status: "error", errorMsg: err.message });
    }

    return null;
  }
);

// ══════════════════════════════════════════════════════════════════════════════
//  פונקציה 2 — Cleanup אוטומטי (Cron כל יום בחצות)
// ══════════════════════════════════════════════════════════════════════════════
exports.scheduledCleanup = onSchedule(
  {
    schedule: "0 0 * * *",          // חצות UTC = 02:00 ישראל
    timeZone: "Asia/Jerusalem",
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async () => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);
    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoff);

    console.log(`[Cleanup] 🧹 Deleting events older than ${CLEANUP_DAYS} days...`);

    const oldDocs = await db
      .collection(EVENTS_COL)
      .where("timestamp", "<", cutoffTs)
      .get();

    if (oldDocs.empty) {
      console.log("[Cleanup] ✅ Nothing to delete");
      return;
    }

    let deletedDocs = 0, deletedFiles = 0;
    const batch = db.batch();

    for (const doc of oldDocs.docs) {
      const { snapshotUrl } = doc.data();

      // מחק קובץ מ-Storage
      if (snapshotUrl) {
        try {
          const match = snapshotUrl.match(/o\/([^?]+)/);
          if (match) {
            await bucket.file(decodeURIComponent(match[1])).delete();
            deletedFiles++;
          }
        } catch (e) {
          if (e.code !== 404) console.warn("[Cleanup] File skip:", e.message);
        }
      }

      batch.delete(doc.ref);
      deletedDocs++;
    }

    await batch.commit();
    console.log(`[Cleanup] ✅ Docs: ${deletedDocs} | Files: ${deletedFiles}`);
  }
);

// ══════════════════════════════════════════════════════════════════════════════
//  פונקציה 3 — HTTP Stats Endpoint
// ══════════════════════════════════════════════════════════════════════════════
exports.getSystemStats = onRequest(
  { region: "europe-west1", cors: true },
  async (req, res) => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [total, todayCount, persons] = await Promise.all([
        db.collection(EVENTS_COL).count().get(),
        db.collection(EVENTS_COL)
          .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(today))
          .count().get(),
        db.collection(EVENTS_COL).where("label", "==", "person").count().get(),
      ]);

      res.json({
        total: total.data().count,
        today: todayCount.data().count,
        persons: persons.data().count,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
);
