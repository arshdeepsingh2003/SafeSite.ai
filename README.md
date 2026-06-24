# SafeSite AI — Construction Site Safety Monitoring System

**Version 14.0.0 — Live Data & IST Phase**

SafeSite AI is a real-time construction site safety monitoring platform that uses computer vision (YOLOv11) and LLM-powered analytics to detect PPE (Personal Protective Equipment) violations. It processes uploaded videos or live HLS streams, identifies workers without hard hats or safety vests, generates instant alerts (via WebSocket), sends email notifications for high-severity violations, and produces AI-driven safety reports.

> **Time Zone:** All timestamps use **IST (Indian Standard Time, UTC+5:30)** throughout the entire stack.

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [1. Clone & Prepare](#1-clone--prepare)
  - [2. Backend Setup](#2-backend-setup)
  - [3. AI Service Setup](#3-ai-service-setup)
  - [4. Frontend Setup](#4-frontend-setup)
  - [5. Login](#5-login)
- [Environment Variables Reference](#environment-variables-reference)
- [Available Scripts](#available-scripts)
- [API Overview](#api-overview)
- [WebSocket Events (Socket.IO)](#websocket-events-socketio)
- [Database (MongoDB)](#database-mongodb)
- [Data Flow](#data-flow)
- [Project Structure](#project-structure)
- [Order of Startup](#order-of-startup)
- [Security Notes](#security-notes)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Architecture

```
┌──────────────┐     HTTP/WS      ┌──────────────┐     HTTP      ┌──────────────┐
│   Frontend   │ ◄──────────────► │   Backend    │ ◄──────────► │  AI Service  │
│  React/Vite  │   Socket.IO      │  FastAPI +   │   REST API   │  YOLOv11 +   │
│  localhost   │                  │  MongoDB     │              │  OpenCV      │
│    :5173     │                  │  localhost   │              │  (standalone)│
└──────────────┘                  │    :8000     │              └──────────────┘
                                  └──────────────┘
                                        │
                                   ┌────┴────┐
                                   │ MongoDB │
                                   │ (Atlas) │
                                   └─────────┘
```

### Components

| Service     | Tech Stack                                                               | Port  |
|-------------|--------------------------------------------------------------------------|-------|
| **Frontend**  | React 19, Vite 8, Tailwind CSS 3, Socket.IO Client, Recharts, Lucide  | 5173  |
| **Backend**   | FastAPI, Motor (MongoDB), Socket.IO, JWT, Groq SDK                      | 8000  |
| **AI Service** | Ultralytics YOLOv11, PyTorch, OpenCV, NumPy                           | —     |

---

## Prerequisites

Before starting, make sure the following are installed on your machine.

| Requirement     | Minimum Version | Check Command             |
|----------------|-----------------|---------------------------|
| **Node.js**    | 18+             | `node -v`                 |
| **npm**        | 9+              | `npm -v`                  |
| **Python**     | 3.10+           | `python --version`        |
| **pip**        | (comes with Python) | `pip --version`       |
| **Git**        | Any recent      | `git --version`           |

### External Services (Required)

| Service | Purpose | Setup |
|---------|---------|-------|
| **MongoDB** — [Atlas (free tier)](https://www.mongodb.com/atlas) or local | Database | Create a cluster, get your connection string |
| **(Optional) Groq** — [API Key](https://console.groq.com) | LLM safety reports | Generate a key at console.groq.com |
| **(Optional) Gmail** — [App Password](https://support.google.com/accounts/answer/185833) | Email alerts | Enable 2FA, generate an app password |

---

## Quick Start

### 1. Clone & Prepare

```bash
git clone https://github.com/<your-org>/SafeSite.ai.git
cd SafeSite.ai
```

> **Windows users:** Run all terminals as **PowerShell** or **Command Prompt**. Paths use backslashes; adapt scripts accordingly.

---

### 2. Backend Setup

```bash
cd backend
```

#### 2a. Create Environment File

Create `backend/.env` with the following variables:

```env
# --- MongoDB (Required) ---
MONGO_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=safesite_ai

# --- JWT Authentication (Required) ---
# Generate a secure key: run `python -c "import secrets; print(secrets.token_hex(32))"`
SECRET_KEY=<your-random-64-char-secret>
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# --- Groq LLM (optional) ---
GROQ_API_KEY=gsk_<your-groq-api-key>
GROQ_MODEL=llama3-70b-8192

# --- Email Alerts (optional) ---
MAIL_USERNAME=your.email@gmail.com
MAIL_PASSWORD=<your-gmail-app-password>
MAIL_FROM=your.email@gmail.com
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
ALERT_RECIPIENTS=your.email@gmail.com
EMAIL_ALERTS_ENABLED=true

# --- App Settings ---
APP_ENV=development
BACKEND_PORT=8000

# --- Default Admin Credentials (for create_admin.py) ---
ADMIN_EMAIL=safety_admin@safesiteai.com
ADMIN_PASSWORD=<choose-a-strong-password>
ADMIN_NAME=Site Admin
```

> **Generating a SECRET_KEY:** Run `python -c "import secrets; print(secrets.token_hex(32))"` to generate a secure 64-character random string.

#### 2b. Create a Virtual Environment (Recommended)

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

#### 2c. Install Dependencies

```bash
pip install -r requirements.txt
```

#### 2d. Seed the Database

```bash
# Create the default admin user (reads ADMIN_* from .env)
python create_admin.py

# (Optional) Seed sample data for testing
python seed_alerts.py          # 25 sample alerts
python seed_analytics.py       # Sample analytics aggregations
python seed_reports.py         # Sample generated reports
python seed_sites_workers.py   # Sample sites and workers
```

#### 2e. Start the Backend

```bash
uvicorn main:socket_app --reload --port 8000
```

**Verify it's running:**
- API: http://localhost:8000
- Swagger Docs: http://localhost:8000/docs
- Health Check: http://localhost:8000/health

> Keep this terminal running. Open a **new terminal** for the next steps.

---

### 3. AI Service Setup

Open a **new terminal** in the project root.

```bash
cd ai-service
```

#### 3a. Create Environment File

Create `ai-service/.env`:

```env
BACKEND_URL=http://localhost:8000
MODEL_PATH=model/ppe_model.pt
CONFIDENCE_THRESHOLD=0.5
PPE_CONF_THRESHOLD=0.4
FRAME_SAMPLE_RATE=2
IOU_MATCH_THRESHOLD=0.3
VIOLATION_CONFIRM_FRAMES=6
PPE_RATIO_THRESHOLD=0.5
VIOLATION_END_FRAMES=5
DEBUG_DETECTIONS=true
```

#### 3b. Install Dependencies

```bash
pip install -r requirements.txt
```

> **PyTorch Troubleshooting:** If `torch` installation fails, install it manually from [pytorch.org](https://pytorch.org) (choose the correct CUDA or CPU version for your system).

#### 3c. Download the PPE Model

The recommended model is `yolo11m_safety.pt` with classes: `hat`, `nohat`, `novest`, `person`, `vest`.

```bash
python -c "
from huggingface_hub import hf_hub_download
import shutil
model_path = hf_hub_download(repo_id='wesjos/Yolo-hard-hat-safety-vest', filename='yolo11m_safety.pt')
shutil.copy2(model_path, 'model/ppe_model.pt')
print('Model downloaded to model/ppe_model.pt')
"
```

> A standard YOLOv8n COCO model (`yolov8n.pt`) can be used for testing but **will not** detect PPE-specific classes.

#### 3d. Verify Setup

```bash
python hello.py
```

#### 3e. Run Detection (Manual)

```bash
python detect.py --video path/to/video.mp4 --video_id <mongo-video-id> --zone "Zone A"
```

In normal operation, the backend automatically spawns the AI service when a user triggers analysis via the frontend.

---

### 4. Frontend Setup

Open a **new terminal** in the project root.

```bash
cd frontend
```

#### 4a. Create Environment File

Create `frontend/.env`:

```env
VITE_API_URL=http://localhost:8000
```

#### 4b. Install Dependencies

```bash
npm install
```

#### 4c. Start the Dev Server

```bash
npm run dev
```

**Verify it's running:** Open http://localhost:5173 in your browser.

---

### 5. Login

Open **http://localhost:5173** and sign in with the admin credentials from your `backend/.env`:

| Field    | Default Value                   |
|----------|---------------------------------|
| Email    | `safety_admin@safesiteai.com`   |
| Password | *(the password you set above)*  |

---

## Order of Startup

To run the full stack, start these **3 terminals** in order:

| Order | Service    | Command                                                    | URL                    |
|-------|------------|------------------------------------------------------------|------------------------|
| 1     | **Backend**  | `cd backend && uvicorn main:socket_app --reload --port 8000`  | http://localhost:8000  |
| 2     | **AI Service** | *(auto-started by backend when analysis is triggered)*     | —                      |
| 3     | **Frontend**  | `cd frontend && npm run dev`                                | http://localhost:5173  |

The AI Service is automatically spawned by the backend when you upload a video and click "Analyze" — you don't need to run it manually for normal operation.

---

## Environment Variables Reference

### Backend (`backend/.env`)

| Variable                     | Required | Default                  | Description                            |
|------------------------------|----------|--------------------------|----------------------------------------|
| `MONGO_URL`                  | **Yes**  | —                        | MongoDB connection string              |
| `DATABASE_NAME`              | No       | `safesite_ai`            | MongoDB database name                  |
| `SECRET_KEY`                 | **Yes**  | —                        | JWT signing secret (min 32 chars)      |
| `ALGORITHM`                  | No       | `HS256`                  | JWT algorithm                          |
| `ACCESS_TOKEN_EXPIRE_MINUTES`| No       | `1440`                   | JWT expiry (24 hours)                  |
| `GROQ_API_KEY`               | No       | —                        | Groq API key for LLM reports           |
| `GROQ_MODEL`                 | No       | `llama3-70b-8192`        | Groq model name                        |
| `MAIL_USERNAME`              | No*      | —                        | Gmail address for sending alerts        |
| `MAIL_PASSWORD`              | No*      | —                        | Gmail App Password                     |
| `MAIL_FROM`                  | No       | Same as `MAIL_USERNAME`  | From address for alert emails          |
| `MAIL_SERVER`                | No       | `smtp.gmail.com`         | SMTP server                            |
| `MAIL_PORT`                  | No       | `587`                    | SMTP port (STARTTLS)                   |
| `ALERT_RECIPIENTS`           | No       | `MAIL_USERNAME`          | Comma-separated email recipients       |
| `EMAIL_ALERTS_ENABLED`       | No       | `true`                   | Toggle email alert feature             |
| `APP_ENV`                    | No       | `development`            | Environment label                      |
| `BACKEND_PORT`               | No       | `8000`                   | Backend server port                    |
| `ADMIN_EMAIL`                | No       | —                        | Seed admin email (for `create_admin.py`)|
| `ADMIN_PASSWORD`             | No       | —                        | Seed admin password                    |
| `ADMIN_NAME`                 | No       | `Site Admin`             | Seed admin display name                |

\* Email alerts are optional. All alerts are saved to MongoDB regardless of email configuration.

### AI Service (`ai-service/.env`)

| Variable                | Required | Default | Description                               |
|-------------------------|----------|---------|-------------------------------------------|
| `BACKEND_URL`           | No       | `http://localhost:8000` | Backend URL to POST results to |
| `MODEL_PATH`            | No       | `model/ppe_model.pt` | Path to YOLO model weights        |
| `CONFIDENCE_THRESHOLD`  | No       | `0.5`   | Min confidence for person detection        |
| `PPE_CONF_THRESHOLD`    | No       | `0.4`   | Min confidence for PPE class detection     |
| `FRAME_SAMPLE_RATE`     | No       | `2`     | Process every Nth frame (lower = slower)   |
| `IOU_MATCH_THRESHOLD`   | No       | `0.3`   | IoU threshold for worker tracking matching |
| `VIOLATION_CONFIRM_FRAMES` | No    | `6`     | Consecutive non-PPE frames before alert    |
| `PPE_RATIO_THRESHOLD`   | No       | `0.5`   | Min ratio of frames with positive PPE      |
| `VIOLATION_END_FRAMES`  | No       | `5`     | Consecutive compliant frames to end alert  |
| `DEBUG_DETECTIONS`      | No       | `true`  | Print debug info during detection          |

### Frontend (`frontend/.env`)

| Variable       | Required | Default                   | Description                  |
|----------------|----------|---------------------------|------------------------------|
| `VITE_API_URL` | No       | `http://localhost:8000`   | Backend API base URL         |

---

## Available Scripts

### Frontend

| Script      | Command          | Description                         |
|-------------|------------------|-------------------------------------|
| `dev`       | `vite`           | Start development server            |
| `build`     | `vite build`     | Production build to `dist/`         |
| `preview`   | `vite preview`   | Preview production build locally    |
| `lint`      | `eslint .`       | Lint all JavaScript/JSX files       |

### Backend

| Script                 | Command                                   | Description                    |
|------------------------|-------------------------------------------|--------------------------------|
| Start server           | `uvicorn main:socket_app --reload --port 8000` | Development server with hot reload |
| Create admin user      | `python create_admin.py`                  | Seed default admin in MongoDB  |
| Seed sample alerts     | `python seed_alerts.py`                   | Insert 25 test alerts          |
| Seed analytics         | `python seed_analytics.py`                | Insert sample analytics data   |
| Seed reports           | `python seed_reports.py`                  | Insert sample generated reports|
| Seed sites & workers   | `python seed_sites_workers.py`            | Insert sample sites/workers    |

### AI Service

| Script                 | Command                                                      | Description                     |
|------------------------|--------------------------------------------------------------|---------------------------------|
| Verify setup           | `python hello.py`                                            | Check environment and imports   |
| Run detection (video)  | `python detect.py --video <path> --video_id <id> --zone "Zone A"` | Process a video for violations |
| Run detection (stream) | `python stream_detect.py --stream <hls-url> --zone "Zone A"` | Process a live HLS stream       |
| Debug detections       | `python debug_ppe.py`                                        | Test PPE detection with debug output |
| Run tests              | `python test_detection.py`                                   | Run detection test suite        |

---

## API Overview

| Endpoint Group    | Prefix            | Description                              |
|-------------------|-------------------|------------------------------------------|
| Authentication    | `/auth`           | Login, register, JWT token management    |
| Videos            | `/video`          | Upload, list, delete videos & streams    |
| AI Analysis       | `/ai`             | Trigger analysis, receive results        |
| Alerts            | `/alerts`         | CRUD alerts, resolve, summary (date filter, exclude resolved) |
| Dashboard         | `/dashboard`      | Stats, hourly trends, zone breakdown     |
| Analytics         | `/analytics`      | Daily/weekly trends, violation breakdown, zone summary, detection summary |
| Reports           | `/reports`        | Generate & download AI safety reports (range/zone filtering) |
| LLM Insights      | `/llm`            | Groq-powered safety insights             |
| Email             | `/email`          | Email config, test alerts                |
| Proxy             | `/proxy`          | HLS stream proxy (CORS avoidance)        |
| Live Detection    | `/live-detection` | Real-time frame analysis results         |
| Upload Insights   | `/upload-insights`| Insights from video upload analysis      |
| Socket Test       | `/socket-test`    | WebSocket connectivity test              |
| Health            | `/health`         | Health check endpoint                    |

> Full interactive API documentation is available at **http://localhost:8000/docs** when the backend is running.

---

## WebSocket Events (Socket.IO)

| Event              | Direction         | Description                         |
|--------------------|-------------------|-------------------------------------|
| `connect`          | Client → Server   | Client connects                     |
| `disconnect`       | Client → Server   | Client disconnects                  |
| `join_room`        | Client → Server   | Join a zone-specific room           |
| `ping`             | Client → Server   | Keep-alive ping                     |
| `connected`        | Server → Client   | Welcome message with session ID     |
| `new_alert`        | Server → Client   | New violation alert emitted         |
| `alert_resolved`   | Server → Client   | Alert was marked resolved           |
| `stats_update`     | Server → Client   | Updated dashboard statistics        |
| `system_status`    | Server → Client   | Heartbeat every 30 seconds          |
| `live_detection`   | Bidirectional     | Real-time frame detection data      |
| `pong`             | Server → Client   | Pong response                       |
| `room_joined`      | Server → Client   | Room join confirmation              |

Socket.IO endpoint: **ws://localhost:8000/socket.io**

---

## Database (MongoDB)

**Database name:** `safesite_ai`

Collections are created automatically on first write. No migration step is required.

| Collection   | Description                          |
|--------------|--------------------------------------|
| `users`      | User accounts (name, email, hashed password, role) |
| `videos`     | Uploaded videos and live HLS streams |
| `alerts`     | Safety violation alerts with severity, zone, timestamps, worker_id |
| `sites`      | Construction sites (camera count, active status) |
| `reports`    | Generated AI safety reports (stats, top zones, LLM summary) |
| `settings`   | Application settings (e.g. alert cooldown) |

> **Note:** There is no dedicated `workers` collection. Worker counts are derived from distinct `worker_id` values in the `alerts` collection.

---

## Data Flow

```
Frontend                  Backend                   AI Service
   │                        │                          │
   │  Upload Video          │                          │
   │ ─────────────────────► │                          │
   │                        │  Store in MongoDB        │
   │                        │  Save file to uploads/   │
   │                        │                          │
   │  POST /ai/analyze      │                          │
   │ ─────────────────────► │                          │
   │                        │  Spawn detect.py         │
   │                        │ ───────────────────────► │
   │                        │                          │
   │                        │  POST /ai/results        │
   │                        │ ◄─────────────────────── │
   │                        │                          │
   │  Socket.IO "new_alert" │  Create Alert in DB      │
   │ ◄───────────────────── │  Send Email (if enabled) │
   │                        │                          │
   │  GET /ai/status        │                          │
   │ ─────────────────────► │                          │
```

---

## Project Structure

```
SafeSite.ai/
├── frontend/                     # React + Vite dashboard
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/           # AppLayout, Sidebar, ProtectedRoute
│   │   │   ├── pages/            # Dashboard, Alerts, Reports, VideoUpload, LiveMonitoring, Login
│   │   │   └── ui/               # AIInsightPanel, LiveAIInsight, AnalysisResultCard, etc.
│   │   ├── context/              # Auth, Socket, Sound, Stream, Alert, UploadInsight
│   │   ├── hooks/                # useAlerts, useReports, useAnalytics, useLLM, etc.
│   │   ├── services/             # API client (Axios), Socket.IO, soundService, hlsProxy
│   │   ├── App.jsx               # Root component with routing
│   │   └── main.jsx              # Entry point
│   ├── .env                      # Frontend environment
│   ├── package.json
│   └── vite.config.js
│
├── backend/                      # FastAPI server
│   ├── routes/
│   │   ├── auth.py               # JWT authentication
│   │   ├── video.py              # Video upload & management
│   │   ├── ai_results.py         # AI analysis results
│   │   ├── alerts.py             # CRUD alerts, date filtering, summary
│   │   ├── dashboard.py          # Dashboard stats & trends
│   │   ├── analytics.py          # Analytics (trend, by-zone, compliance, heatmap)
│   │   ├── reports.py            # Generate & download safety reports
│   │   ├── llm.py                # Groq LLM insights
│   │   ├── email.py              # Email alert configuration
│   │   ├── proxy.py              # HLS stream proxy (CORS)
│   │   ├── live_detection.py     # Real-time detection results
│   │   ├── upload_insights.py    # Upload analysis insights
│   │   └── socket_test.py        # WebSocket test endpoint
│   ├── models/
│   │   ├── alert.py              # Alert: created_at (IST), zone, severity, worker_id
│   │   ├── user.py               # User: email, hashed password, role
│   │   └── video.py              # Video: filename, status, uploaded_at (IST)
│   ├── services/
│   │   ├── alert_service.py      # Alert query logic (exclude resolved, date filter)
│   │   ├── auth_service.py       # JWT creation & verification
│   │   ├── email_service.py      # SMTP email dispatch
│   │   └── groq_service.py       # Groq LLM client
│   ├── analytics/
│   │   └── aggregate_detections.py  # Periodic detection aggregation
│   ├── main.py                   # ASGI entry point (FastAPI + Socket.IO)
│   ├── database.py               # MongoDB connection via Motor
│   ├── socket_server.py          # Socket.IO server setup & events
│   ├── time_utils.py             # IST helper (utc+5:30)
│   ├── create_admin.py           # Admin user seeder
│   ├── seed_alerts.py            # Sample alerts seeder
│   ├── seed_analytics.py         # Sample analytics seeder
│   ├── seed_reports.py           # Sample reports seeder
│   ├── seed_sites_workers.py     # Sample sites seeder
│   ├── .env                      # Backend environment
│   └── requirements.txt
│
├── ai-service/                   # AI detection engine
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── violation_detector.py # Core PPE detection logic
│   │   └── frame_annotator.py    # Bounding box drawing
│   ├── model/                    # YOLO model weights (gitignored)
│   ├── detect.py                 # Video file detection
│   ├── stream_detect.py          # Live HLS stream detection
│   ├── debug_ppe.py              # Debug/testing PPE detection
│   ├── test_detection.py         # Detection test suite
│   ├── hello.py                  # Environment verification
│   ├── time_utils.py             # IST helper for AI service
│   ├── .env                      # AI service environment
│   └── requirements.txt
│
├── .gitignore
└── README.md
```

---

## Security Notes

- **All `.env` files are gitignored.** Never commit secrets to version control.
- The JWT `SECRET_KEY` in `backend/.env` should be a long, cryptographically random string. Generate one with `python -c "import secrets; print(secrets.token_hex(32))"`. **Do not use the example value in production.**
- The MongoDB connection string in `MONGO_URL` includes credentials. Use a dedicated database user with minimal required permissions.
- The Gmail App Password (`MAIL_PASSWORD`) grants access to the associated Google account. Rotate it regularly.
- For production deployments, use environment variables or a secrets manager (e.g., HashiCorp Vault, AWS Secrets Manager) instead of `.env` files.

---

## Troubleshooting

| Issue                          | Likely Fix                                                    |
|--------------------------------|---------------------------------------------------------------|
| `Connection refused` to MongoDB | Verify `MONGO_URL` is correct and network allows outbound connections |
| Frontend can't reach backend   | Check `VITE_API_URL` in `frontend/.env` matches backend address |
| CORS errors in browser         | Backend CORS is configured for `http://localhost:5173` by default |
| AI model not found             | Place `ppe_model.pt` in `ai-service/model/` or update `MODEL_PATH` |
| `torch` / `torchvision` installation fails | Install PyTorch separately from https://pytorch.org (CUDA vs CPU) |
| Socket.IO not connecting       | Ensure backend is started with `main:socket_app` (not `main:app`) |
| Email alerts not sending       | Verify `MAIL_PASSWORD` is a Gmail App Password (not the account password) |
| Reports show no data           | Check report type range — daily = last 24h, week = last 7d, month = last 30d |
| Alert counts seem low          | Resolved alerts are excluded from all summary counts by default |
| Times appear off by 5:30       | All timestamps are **IST (UTC+5:30)** — not UTC |
| `pip install` fails for `uvicorn` | Upgrade pip: `python -m pip install --upgrade pip` |

---

## License

This project is proprietary software. All rights reserved.
