# Smart-Vision Guard 🛡️
### Real-time AI Security Monitoring System

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react)](https://reactjs.org)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.x-FF6F00?logo=tensorflow)](https://www.tensorflow.org/js)
[![Firebase](https://img.shields.io/badge/Firebase-10-FFCA28?logo=firebase)](https://firebase.google.com)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)

---

## Overview

**Smart-Vision Guard** is a Full-Stack security monitoring system that uses your computer's webcam and AI to detect people in real-time and send instant WhatsApp alerts.

Built as a final project at **Ashkelon Academic College, 2024–2025**.

### Key Capabilities
- 🎯 Real-time person detection via COCO-SSD (TensorFlow.js + WebGL)
- 📱 Instant WhatsApp alert with snapshot image (< 3 seconds)
- 🔁 Visual Re-ID — identifies returning visitors without facial recognition
- 🗺️ Predictive Trajectory — alerts before a person enters a restricted zone
- 🔒 Forensic SHA-256 signing on every event
- 📊 Adaptive image quality based on Shannon Entropy + network conditions
- 🫧 Privacy obfuscation — background blurred, only detected subject is sharp

---

## Architecture

```
Browser (React + TF.js)
    │
    ├── COCO-SSD WebGL inference @ ~30 FPS
    ├── AI Services: embeddings · trajectory · forensics · adaptive · privacy
    └── Armed → Firebase Pipeline
                    │
                    ├── Firebase Storage  /detections/
                    ├── Firestore         /events/
                    └── Cloud Function → Twilio → WhatsApp
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite 5 |
| AI / CV | TensorFlow.js + COCO-SSD (WebGL) |
| Auth | Firebase Authentication |
| Database | Cloud Firestore (real-time) |
| Storage | Firebase Storage |
| Backend | Firebase Cloud Functions (Node.js 20) |
| Messaging | Twilio WhatsApp API |
| Crypto | Web Crypto API (SHA-256) |
| Audio | Web Audio API (synthetic alerts) |

---

## Project Structure

```
smart-vision-guard/
├── src/
│   ├── App.jsx                        # Auth guard
│   ├── main.jsx                       # Entry point
│   ├── components/
│   │   ├── auth/LoginScreen.jsx       # Login with boot animation
│   │   └── dashboard/Dashboard.jsx   # Main UI
│   ├── hooks/
│   │   ├── useAuth.js                 # Auth state management
│   │   ├── useDetection.js            # AI orchestrator hook
│   │   └── useRealtimeEvents.js       # Firestore real-time listener
│   └── services/
│       ├── firebase/
│       │   ├── config.js              # Firebase init
│       │   ├── auth.js                # login / logout
│       │   └── firestore.js           # upload + save + subscribe
│       └── ai/
│           ├── embeddings.js          # HSV Re-ID (Cosine Similarity)
│           ├── trajectory.js          # ObjectTracker + Ray Casting
│           ├── forensics.js           # SHA-256 event signing
│           ├── adaptive.js            # Entropy-based quality
│           └── privacy.js             # Two-pass canvas obfuscation
├── functions/
│   ├── index.js                       # Cloud Functions
│   └── package.json
├── firestore.rules
├── storage.rules
├── firebase.json
└── .env.example                       # Copy to .env and fill in your values
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project (Blaze plan required for Cloud Functions)
- Twilio account (free trial works)

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/smart-vision-guard.git
cd smart-vision-guard
npm install
cd functions && npm install && cd ..
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your values (see `.env.example` for all required keys).

### 3. Firebase Setup

```bash
firebase login
firebase use YOUR_PROJECT_ID

# Set Twilio credentials as secrets (never hardcode these)
firebase functions:secrets:set TWILIO_ACCOUNT_SID
firebase functions:secrets:set TWILIO_AUTH_TOKEN
firebase functions:secrets:set TWILIO_TO_NUMBER      # your WhatsApp number
firebase functions:secrets:set TWILIO_FROM_NUMBER    # Twilio sandbox number
```

### 4. Deploy Rules & Functions

```bash
firebase deploy --only firestore:rules
firebase deploy --only storage
firebase deploy --only functions
```

### 5. Run Locally

```bash
npm run dev
# → http://localhost:5173
```

Create a user in **Firebase Console → Authentication → Add user**, using the same email as `VITE_ALLOWED_EMAIL` in your `.env`.

---

## Environment Variables

Copy `.env.example` to `.env` — never commit `.env` to Git.

| Variable | Description |
|----------|-------------|
| `VITE_FIREBASE_API_KEY` | Firebase project API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase auth domain |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Messaging sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |
| `VITE_ALLOWED_EMAIL` | Only this email can log in |
| `VITE_FORENSIC_PEPPER` | Secret pepper for SHA-256 signing |

Cloud Function secrets (set via `firebase functions:secrets:set`):

| Secret | Description |
|--------|-------------|
| `TWILIO_ACCOUNT_SID` | Twilio account SID |
| `TWILIO_AUTH_TOKEN` | Twilio auth token |
| `TWILIO_TO_NUMBER` | WhatsApp destination number |
| `TWILIO_FROM_NUMBER` | Twilio sandbox number |

---

## Security

- Firebase Auth with single-email allow-list (`VITE_ALLOWED_EMAIL`)
- Firestore rules: authenticated users only
- Storage rules: public read for WhatsApp delivery, authenticated write
- Twilio credentials stored in Google Secret Manager — never in code
- SHA-256 forensic signing on every detection event
- Privacy obfuscation: background blurred in all stored snapshots

---

## Performance

| Metric | Value |
|--------|-------|
| Inference time | ~30ms (WebGL GPU) |
| Real-time FPS | 25–30 |
| WhatsApp alert latency | < 3 seconds |
| Re-ID accuracy | 88%+ (Cosine Similarity) |
| Model size | ~1.5MB (lite_mobilenet_v2) |
| JPEG quality range | 35%–95% (adaptive) |

---

## Advanced AI Features

1. **Visual Re-ID** — 51D HSV embedding vector + Cosine Similarity (no facial data stored)
2. **Predictive Trajectory** — EMA velocity + Ray Casting polygon breach detection
3. **Forensic Signing** — SHA-256(canonicalJSON + pepper) via Web Crypto API
4. **Adaptive Transmission** — Shannon Entropy × Network Quality → dynamic JPEG quality
5. **Privacy Obfuscation** — Two-pass canvas: blurred background, sharp subject only

---

## License

MIT — see [LICENSE](LICENSE)

---

*Smart-Vision Guard · Ashkelon Academic College · 2024–2025*
