# KuraTe — Session Summary (Jul 2026)

## Project
- KuraTe: general services marketplace (rebranded from FullMinent/SexAppeal)
- Backend: Node.js + Express + MongoDB 4.4 (Docker on port 27018)
- Frontend: Single landing page (`public/index.html`) with need-based UX

## What's Been Built

### Core Platform
- Landing page with "¿Qué necesitás?" search: acción dropdown, descripción textarea, ubicación cascade (provincia→ciudad), urgencia dropdown, professional results cards with match percentage bar + WhatsApp contact
- Pre-registration flow (4 steps sequential): email+phone+DOB → SMS code → email verify → DNI photo OCR
- Professional search with relevance scoring (service match +30, bio keyword +10, location +15/+10, action +5, urgency +10, avg rating ×5)
- Location data seeded: 24 provinces, 229 cities, 47 CABA neighborhoods
- Taxonomy-based matching (`utils/needMatching.js`): 15 domains, inappropriate words filter
- DNI OCR (`utils/dniOcr.js`): extracts DOB from "15 ENE/JAN 1969" format via tesseract.js

### Feedback System (NEW)
- `models/Feedback.js` — schema with professional reference, customerEmail, rating (1-5), comment, status (pending/sent/completed), TTL index 90 days
- `controllers/feedbackController.js` — 4 endpoints:
  - `POST /api/v1/feedback/request` — creates pending feedback when customer clicks WhatsApp
  - `POST /api/v1/feedback/submit` — customer submits rating+comment from poll page
  - `GET /api/v1/feedback/rating/:professionalId` — returns average rating + count
  - `processPendingFeedback()` — runs every hour, sends poll email after 7 days
- `public/feedback.html` — star-rating poll page (1-5 stars, optional comment)
- Average rating integrated into search relevance scoring (+5 per star)
- Landing page WhatsApp contact triggers feedback request with email prompt

### Mobile (NEW)
- Capacitor configured (`capacitor.config.json` — app ID `com.kurate.app`)
- Android platform added, APK built successfully (12.9 MB at `android/app/build/outputs/apk/debug/app-debug.apk`)
- iOS platform added (requires macOS/Xcode to build)
- Build scripts: `npm run cap:sync`, `cap:open:android`, `cap:open:ios`, `cap:build:android`
- `scripts/deploy-local.ps1` updated with step [6/6] for APK compilation
- `.gitignore` updated for mobile build artifacts

### UI (NEW)
- Top bar: back button (left), "Crear aviso" button + ES/EN flag icons (right)
- Language switcher: lightweight inline translation (~80 Spanish→English pairs), `window._t()` function for dynamic text, DOM walker on English mode, stored in `localStorage.platform_lang`

## Key Files
- `D:\FullMinent\server.js` — main server (748+ lines)
- `D:\FullMinent\public\index.html` — landing page with inline CSS/JS
- `D:\FullMinent\public\feedback.html` — star-rating poll page
- `D:\FullMinent\capacitor.config.json` — Capacitor mobile config
- `D:\FullMinent\scripts\deploy-local.ps1` — 6-step deploy script (includes APK build)
- `D:\FullMinent\controllers\feedbackController.js` — feedback API + cron processor
- `D:\FullMinent\models\Feedback.js` — feedback schema
- `D:\FullMinent\models\PreRegistration.js` — temp TTL 24h

## Environment
- JDK 21 installed at `C:\Program Files\Microsoft\jdk-21.0.11.10-hotspot` (for Android builds)
- Android SDK at `C:\Users\Administrator\AppData\Local\Android\Sdk`
- MongoDB Docker container: `FullMinent_mongo` on port 27018
- `.env` requires `SMS_ALLOW_NON_PROD=true` for SMS in dev

## Known Issues
- API calls from mobile APK will target localhost:5001 (not accessible from device). For production, set `server.url` in capacitor.config.json to deployed backend.
- Google sign-in blocked until `GOOGLE_CLIENT_ID` is set
