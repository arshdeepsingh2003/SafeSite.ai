# SafeSite AI — Construction Site Safety Monitoring System

**Version 13.0.0 — Analytics Phase**

SafeSite AI is a real-time construction site safety monitoring platform that uses computer vision (YOLOv11) and LLM-powered analytics to detect PPE (Personal Protective Equipment) violations. It processes uploaded videos or live HLS streams, identifies workers without hard hats or safety vests, generates instant alerts (via WebSocket), sends email notifications for high-severity violations, and produces AI-driven safety reports.

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

| Service     | Tech Stack                                                    | Port  |
|-------------|---------------------------------------------------------------|-------|
| **Frontend**  | React 19, Vite 8, Tailwind CSS 3, Socket.IO Client, Recharts | 5173  |
| **Backend**   | FastAPI, Motor (MongoDB), Socket.IO, JWT, Groq SDK            | 8000  |
| **AI Service** | Ultralytics YOLOv11, PyTorch, OpenCV, NumPy                 | —     |

---

## Prerequisites

- **Node.js** 18+ and **npm** 9+
- **Python** 3.10+
- **MongoDB** instance — [MongoDB Atlas](https://www.mongodb.com/atlas) (free tier) or local MongoDB
- **(Optional)** [Groq API key](https://console.groq.com) — for LLM-generated safety reports
- **(Optional)** Gmail account with an [App Password](https://support.google.com/accounts/answer/185833) — for email alert notifications

---

## Quick Start

### 1. Clone the Repository

```bash
git clone <repo-url>
cd SafeSite.ai
```

---

### 2. Backend Setup

```bash
cd backend
```

#### 2a. Create Environment File

Create `backend/.env` with the following variables:

```env
# --- MongoDB ---
MONGO_URL=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
DATABASE_NAME=safesite_ai

# --- JWT Authentication ---
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

#### 2b. Install Dependencies

```bash
pip install -r requirements.txt
```

> **Tip:** Use a virtual environment:
> ```bash
> python -m venv venv
> venv\Scripts\activate   # Windows
> source venv/bin/activate  # macOS/Linux
> pip install -r requirements.txt
> ```

#### 2c. Seed the Database

```bash
# Create the default admin user (reads ADMIN_* from .env)
python create_admin.py

# (Optional) Seed 25 sample alerts for testing the dashboard
python seed_alerts.py
```

#### 2d. Start the Backend

```bash
uvicorn main:socket_app --reload --port 8000
```

The backend is now running at **http://localhost:8000**  
API docs (Swagger UI) at **http://localhost:8000/docs**  
Socket.IO endpoint at **ws://localhost:8000/socket.io**

---

### 3. AI Service Setup

Open a **new terminal**.

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

#### 3c. Download the PPE Model

Place a YOLO model weights file at `ai-service/model/ppe_model.pt`.

The model should support these classes: `hat`, `nohat`, `novest`, `person`, `vest`.

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

Open a **new terminal**.

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

The frontend is now running at **http://localhost:5173**.

---

### 5. Login

Open **http://localhost:5173** and sign in with the admin credentials from your `backend/.env`:

| Field    | Default Value                   |
|----------|---------------------------------|
| Email    | `safety_admin@safesiteai.com`   |
| Password | *(the password you set above)*  |

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

### AI Service

| Script                 | Command                                                      | Description                     |
|------------------------|--------------------------------------------------------------|---------------------------------|
| Verify setup           | `python hello.py`                                            | Check environment and imports   |
| Run detection          | `python detect.py --video <path> --video_id <id> --zone "Zone A"` | Process a video for violations |

---

## API Overview

| Endpoint Group | Prefix          | Description                           |
|----------------|-----------------|---------------------------------------|
| Authentication | `/auth`         | Login, register, JWT token management |
| Videos         | `/video`        | Upload, list, delete videos & streams |
| AI Analysis    | `/ai`           | Trigger analysis, receive results     |
| Alerts         | `/alerts`       | CRUD alerts, resolve, summary         |
| Dashboard      | `/dashboard`    | Stats, hourly trends, zone breakdown  |
| Analytics      | `/analytics`    | Daily/weekly trends, violation breakdown |
| Reports        | `/reports`      | Generate & download AI safety reports |
| LLM Insights   | `/llm`          | Groq-powered safety insights          |
| Email          | `/email`        | Email config, test alerts             |
| Proxy          | `/proxy`        | HLS stream proxy (CORS avoidance)     |
| Health         | `/health`       | Health check endpoint                 |

Full interactive API documentation is available at **http://localhost:8000/docs** when the backend is running.

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
| `alerts`     | Safety violation alerts with severity, zone, timestamps |
| `sites`      | Construction sites (stub)            |
| `workers`    | Workers (stub)                       |
| `settings`   | Application settings (e.g. alert cooldown) |
| `reports`    | Generated AI safety reports          |

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
├── frontend/                  # React + Vite dashboard
│   ├── src/
│   │   ├── components/        # Reusable UI components
│   │   ├── pages/             # Page-level components
│   │   ├── services/          # API client (Axios)
│   │   └── App.jsx            # Root component
│   ├── .env                   # Frontend environment
│   ├── package.json
│   └── vite.config.js
│
├── backend/                   # FastAPI server
│   ├── routes/                # API route handlers
│   │   ├── auth.py
│   │   ├── video.py
│   │   ├── ai_results.py
│   │   ├── alerts.py
│   │   ├── dashboard.py
│   │   ├── analytics.py
│   │   ├── reports.py
│   │   ├── llm.py
│   │   ├── email.py
│   │   └── proxy.py
│   ├── main.py                # ASGI entry point
│   ├── database.py            # MongoDB connection
│   ├── models.py              # Pydantic schemas
│   ├── socket_setup.py        # Socket.IO configuration
│   ├── create_admin.py        # Admin seeder
│   ├── seed_alerts.py         # Alert seeder
│   ├── .env                   # Backend environment
│   └── requirements.txt
│
├── ai-service/                # AI detection engine
│   ├── utils/
│   │   ├── violation_detector.py  # Core PPE detection logic
│   │   └── frame_annotator.py     # Bounding box drawing
│   ├── model/                 # YOLO model weights (gitignored)
│   ├── detect.py              # Main detection script
│   ├── hello.py               # Environment verification
│   ├── .env                   # AI service environment
│   └── requirements.txt
│
├── .gitignore
└── README.md
```

---

## Security Notes

- **All `.env` files are gitignored.** Never commit secrets to version control.
- The JWT `SECRET_KEY` in `backend/.env` should be a long, cryptographically random string. **Do not use the example value in production.**
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

---

## License

This project is proprietary software. All rights reserved.
