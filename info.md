# AICC (Artificial Intelligence Candidate Coaching) — Comprehensive Project Documentation

---

## 1. Executive Summary & Project Overview

**AICC (Artificial Intelligence Candidate Coaching)** is an enterprise-grade, full-stack platform engineered to conduct automated, adaptive, AI-driven technical interviews. By fusing large language models, real-time bi-directional streaming protocols, computer vision facial analytics, and semantic code search (Retrieval-Augmented Generation), AICC provides candidates with an authentic, rigorous, and supportive technical evaluation environment.

Unlike traditional mock interview tools that rely on static question banks or simple text forms, AICC:
- **Analyzes candidate resumes** using multimodal vision/document models to extract precise skills, employment timelines, and project scopes.
- **Inspects GitHub open-source repositories** and indexes README documentation into a vector database to generate hyper-specific questions based on the candidate's actual code contributions.
- **Conducts live conversational interviews** over WebSockets, featuring AI voice synthesis (TTS) with configurable accents (defaulting to Indian English), live speech-to-text (STT), speaking pace analytics (Words Per Minute), and browser-native facial emotion recognition.
- **Delivers actionable, multi-dimensional feedback**, including a strict FAANG-style ATS resume audit, a 5-axis competency radar assessment, question-by-question scoring, and a targeted knowledge gap study plan.
- **Provides administrative controls** for system monitoring, user/session audits, and dynamic prompt/parameter configurations without requiring server restarts.

---

## 2. System Architecture & Tech Stack

AICC is structured as a monorepo containing a decoupled Node.js/Express backend, an optimized React/Vite single-page application (SPA), relational and vector database tiers, and integrations with leading AI services.

```
                           +-------------------------------------------------+
                           |                 CLIENT BROWSER                  |
                           |   React 18 + Vite + TailwindCSS + Recharts      |
                           |   Face-API.js (Emotions) + Web Speech API (TTS)  |
                           +------------------------+------------------------+
                                                    |
                                    REST APIs       |  WebSocket (/ws)
                              (Auth, Upload, Admin) |  (Audio, Questions, Eval)
                                                    v
                           +-------------------------------------------------+
                           |               BACKEND SERVER (Node.js)          |
                           |   Express.js + ws Engine + Multer + Rate-Limit  |
                           +--------+-------------------+--------------------+
                                    |                   |
            +-----------------------+                   +--------------------+
            |                       |                   |                    |
            v                       v                   v                    v
  +------------------+    +-------------------+   +-----------+    +-------------------+
  | PostgreSQL 16    |    | ChromaDB Vector   |   | Groq LLM  |    | Google Gemini     |
  | (Relational DB)  |    | (RAG Embeddings)  |   | (Llama-3) |    | (Resume / STT)    |
  +------------------+    +-------------------+   +-----------+    +-------------------+
```

### 2.1 Technology Stack Matrix

| Layer | Technologies & Libraries | Purpose & Responsibilities |
|---|---|---|
| **Frontend Framework** | React 18 (`react`, `react-dom`), Vite, React Router v6 | High-performance SPA with client-side routing and HMR |
| **Frontend Styling** | TailwindCSS, CSS Variables, Outfit & DM Serif Typography | Cyber-minimalist dark theme with responsive glassmorphism |
| **Client State & API** | Zustand (`zustand`), Axios (`axios`), Custom Hooks | Lightweight auth store, JWT persistence, unified HTTP interceptors |
| **Data Visualization** | Recharts (`recharts`) | 5-axis Radar charts, WPM pace line charts, score distribution bars |
| **Computer Vision** | `face-api.js` (TinyFaceDetector, FaceExpressionNet) | Real-time browser-based webcam facial expression detection |
| **Speech & Audio (Client)**| Web Speech API (`SpeechRecognition`, `SpeechSynthesisUtterance`) | In-browser zero-latency STT preview & natural TTS voice output |
| **Backend Runtime** | Node.js, Express 4 (`express`) | Core HTTP REST API server and routing engine |
| **Real-time Networking** | `ws` (Native WebSocket Library) | Bi-directional streaming for audio, questions, evals, and telemetry |
| **Security & Middleware**| `helmet`, `cors`, `express-rate-limit`, `jsonwebtoken`, `bcryptjs`, `zod` | Auth validation, rate-limiting, secure headers, CORS control |
| **Relational Database** | PostgreSQL 16 (`pg`), `uuid-ossp` | Persistent storage for users, sessions, questions, and telemetry |
| **Vector Database (RAG)**| ChromaDB (`chromadb`), HNSW Cosine Index | Vector similarity storage for candidate GitHub README snippets |
| **Primary LLM Engine** | Groq SDK (`groq-sdk`) | Ultra-fast question generation, graded evaluation, gap analysis |
| **Multimodal Vision/Doc**| Google Generative AI (`@google/generative-ai`) | Multimodal PDF resume parsing & audio transcription |
| **Audio Transcription** | AssemblyAI Streaming WebSocket / Groq Whisper (`whisper-large-v3`) | Live streaming voice transcription and fallback engines |
| **File Processing** | `multer`, `pdf-parse` | Multi-part form uploads, PDF binary buffer parsing |

---

## 3. Repository & Monorepo Structure

```
AICC/
├── .env.example                     # Reference environment variables
├── docker-compose.yml               # Docker configuration for Postgres 16 & ChromaDB
├── package.json                     # Monorepo root scripts & backend dependencies
├── vercel.json                      # Vercel deployment routing configuration
├── README.md                        # High-level project summary
├── info.md                          # Detailed project documentation (this file)
│
├── Aicc_backend/                    # Backend Server Application
│   ├── server.js                    # Express app, REST routes, admin API, static SPA serve
│   ├── handler.js                   # WebSocket server engine, audio bridge, interview loop
│   ├── groq.js                      # Groq API client, prompt engineering, evaluation logic
│   ├── gemini.js                    # Google Gemini SDK client (Resume parser & STT)
│   ├── parserFallback.js            # Multi-tiered fallback resume extraction (pdf-parse + Groq)
│   ├── rag.js                       # GitHub repo fetching, text chunking & ChromaDB RAG
│   ├── report.js                    # Session metric calculations and gap analysis aggregator
│   ├── profile.js                   # User profile management and session history routes
│   └── package.json                 # Backend package metadata
│
├── Aicc_frontend/                   # Frontend React Application
│   ├── index.html                   # HTML entry point with Google Fonts (Outfit, DM Mono, DM Serif)
│   ├── vite.config.js               # Vite bundler configuration
│   ├── tailwind.config.js           # TailwindCSS configuration
│   ├── package.json                 # Frontend client dependencies
│   └── src/
│       ├── main.jsx                 # React root mount
│       ├── App.jsx                  # Route definitions and PrivateRoute wrapper
│       ├── lib/
│       │   └── api.js               # Centralized Axios client with JWT bearer interceptors
│       ├── stores/
│       │   └── authStore.js         # Zustand authentication store (login, logout, init)
│       ├── styles/
│       │   └── globals.css          # Design system tokens, dark color palette, animations
│       ├── components/ui/
│       │   └── index.jsx            # Reusable UI library (Button, Card, Input, Tag, Spinner, ScoreRing)
│       ├── hooks/
│       │   ├── useAudioRecorder.js   # MediaRecorder hook for chunked audio capture & upload
│       │   ├── useEmotionDetection.js# Face-api.js hook for facial emotion classification
│       │   ├── useInterviewSocket.js # WebSocket hook with auto-reconnect and heartbeat ping
│       │   ├── useMicrophone.js      # 16kHz PCM audio processor for streaming
│       │   ├── useSpeechRecognition.js# Browser-native Web Speech API STT hook
│       │   └── useTTS.js             # Browser SpeechSynthesis hook with Indian/US/UK accents
│       └── pages/
│           ├── LandingPage.jsx       # Public landing page with feature breakdown
│           ├── LoginPage.jsx         # User login with admin quick-fill button
│           ├── RegisterPage.jsx      # New candidate account registration
│           ├── OnboardingPage.jsx    # Resume dropzone, role selector, difficulty, GitHub URL
│           ├── InterviewPage.jsx     # Live interactive interview room with camera & audio
│           ├── DashboardPage.jsx     # Candidate hub: ATS review, GitHub audit, past sessions
│           ├── ReportPage.jsx        # Post-interview report: 5-axis radar, WPM charts, gap plan
│           └── AdminPage.jsx         # Admin control panel: user, session, and config management
│
├── db/
│   ├── connection.js                # PostgreSQL connection pool manager
│   └── schema.sql                   # Database DDL schema, tables, indices, and constraints
│
├── middleware/
│   └── auth.js                      # JWT authentication verification middleware
│
├── scripts/
│   ├── apply-schema.js              # Node.js script to run db/schema.sql against PostgreSQL
│   └── normalize-emails.sql         # Data cleaning utility script for email uniqueness
│
└── services/
    └── groq.js                      # Re-export alias pointing to Aicc_backend/groq.js
```

---

## 4. Core Features & Functional Modules

### 4.1 Automated Resume Parsing & Multi-Tier Fallback

When a candidate uploads a resume PDF during onboarding:
1. **Tier 1 (Gemini 2.5/2.0 Flash)**: The raw PDF buffer is encoded as base64 and dispatched to Google Gemini via multimodal document comprehension with a strict JSON output schema. It extracts:
   - Full name, email, phone, location, and executive summary.
   - Categorized skills array.
   - Work experience (company, role, start/end dates, and quantifiable bullet points).
   - Projects (name, description, technology stack, GitHub links, measurable impact).
   - Education and certifications.
2. **Tier 2 (pdf-parse + Groq)**: If Gemini fails (e.g. quota limits, network issues), the system automatically attempts binary text extraction using `pdf-parse`. The extracted raw text is then parsed into the required schema by Groq.
3. **Tier 3 (Plaintext & ASCII Scraper Fallback)**: If `pdf-parse` fails on corrupted or malformed PDF streams, the system searches for ASCII printable sequences (regex `[\x20-\x7E\s]{4,}`) and feeds recovered text to Groq.

### 4.2 Real-time ATS Resume Quality Audit

Upon resume extraction, the system automatically runs an ATS (Applicant Tracking System) simulation using Groq:
- **Calibrated ATS Score (0–100)**: Evaluated strictly against modern FAANG hiring standards. Deductions are made for fluff, passive phrasing, and missing metrics.
- **Key Strengths**: Specific formatting and content highlights.
- **Actionable Improvements**: Concrete points to improve readability and keyword relevance.
- **Missing Keywords**: Critical industry/framework technologies missing from the candidate's stack.
- **Structural Bullet Rewrites**: Extracts up to 3 weak bullet points from the resume and rewrites them into high-impact, mathematically quantified statements.

### 4.3 GitHub Profile Analysis & Retrieval-Augmented Generation (RAG)

If a candidate provides their GitHub profile:
1. **Metadata Ingestion**: The backend queries GitHub's REST API for the user's top public repositories, star counts, primary languages, and README files.
2. **Vector Indexing (ChromaDB)**: Repository READMEs and descriptions are segmented into 500-character overlapping chunks and stored in a ChromaDB collection (`aicc_repo_chunks`) using cosine similarity.
3. **Dynamic Context Retrieval**: During the interview, candidate answers are queried against ChromaDB. Relevant code and project context is injected into the LLM system prompt, allowing the interviewer to ask contextual questions such as:
   > *"I noticed in your repository `distributed-cache` that you implemented a custom eviction policy using Redis and Go. How did you resolve concurrency race conditions under high throughput?"*
4. **Portfolio Assessment**: Generates an open-source score, summary, and lists of strengths and growth areas displayed in the candidate's dashboard.

### 4.4 Live Interactive Interview Room

The interview room (`/interview/:sessionId`) provides an immersive, synchronized testing environment:

- **Webcam & Facial Emotion Detection**:
  - The client loads `face-api.js` models (`tinyFaceDetector` and `faceExpressionNet`).
  - Video frames are sampled every 500ms to detect dominant emotional states (`neutral`, `happy`, `sad`, `angry`, `fearful`, `surprised`, `disgusted`).
  - Emotion snapshots are streamed via WebSocket and stored in the database for composure analytics.
- **Speech Synthesis (TTS AI Interviewer)**:
  - The interviewer's questions are read aloud using the browser's `SpeechSynthesis` API.
  - Accent is configurable in real time: **Indian Accent (`en-IN`)** (default), **US Accent (`en-US`)**, or **UK Accent (`en-GB`)**.
  - Includes repeat question audio, mute toggle, and speech interrupt support.
- **Multi-modal Speech-to-Text (STT)**:
  - **Live Preview**: Web Speech API (`useSpeechRecognition`) provides real-time local transcription as the candidate speaks.
  - **Audio Recording**: `useAudioRecorder` captures high-quality WebM/Opus audio and sends it to `/api/stt` (powered by Gemini multimodal audio or Groq Whisper).
  - **Streaming Transcription**: Optional real-time PCM audio streaming to AssemblyAI over WebSocket.
  - **Typing Fallback**: Full manual text input is always available if microphone access is disabled or unavailable.
- **Dynamic Cadence Tracking (WPM)**:
  - Measures candidate speech pace in real time. The optimal conversational range is tracked between **120 and 160 WPM**.
- **Adaptive Question Flow**:
  - Interviews support up to 12 dynamically generated questions.
  - Opening questions reference the candidate's background and resume.
  - Follow-up questions transition across core technical domains (System Design, Databases, APIs, Distributed Systems, Concurrency, Behavioral) and scale according to selected difficulty:
    - **Easy**: Core concepts, accessible definitions, foundational logic.
    - **Medium**: Mid-level industry standards, practical trade-offs, architecture.
    - **Hard**: Staff/Senior-level deep internals, race conditions, edge cases, distributed bottlenecks.

### 4.5 Post-Interview Analytics & Diagnostic Report

Once an interview is concluded (or the 12-question limit is reached), the session is finalized and redirects to `/report/:sessionId`:
- **Overall Score Algorithm**: Weighted calculation combining Technical Competency (70%) and Communication Pace/Cadence (30%).
- **5-Axis Competency Radar Chart**: Visualizes scores across:
  1. *Technical Accuracy*
  2. *Communication & Clarity*
  3. *Pace / Delivery* (penalties for speaking <90 WPM or >210 WPM)
  4. *Composure* (ratio of neutral/happy expressions to stressed emotions)
  5. *Answer Depth* (substantive detail and metric quantification)
- **Question-by-Question Breakdown**: Interactive bar chart comparing technical scores across all sequence turns, accompanied by WPM trend graphs.
- **Complete Transcript & Critiques**: Full log of every question, candidate response, assigned score (0–100), key strengths, and specific feedback.
- **Actionable Knowledge Gap Plan**: AI-synthesized matrix detailing identified technical weaknesses, severity levels (*High*, *Medium*, *Low*), and concrete study recommendations.

### 4.6 Administration Panel

The system includes a dedicated management portal accessible to admin accounts (default: `admin@123`):
- **User Management**: Inspect registered users, view registration dates, manually create user accounts, edit details, or delete candidates and their cascading data.
- **Session Audit**: Review all active and completed interview sessions, view scores, adjust status, or delete test sessions.
- **Dynamic System Configs**: Key-value JSON configuration store (`system_configs`) allowing runtime updates to LLM prompts, difficulty multipliers, or scoring weights without redeploying code.

---

## 5. Database Schema & Data Models

The relational schema is defined in [db/schema.sql](file:///c:/Users/haris/OneDrive/Documents/GitHub/AICC/db/schema.sql) and executed via PostgreSQL.

```
                              +-----------------------+
                              |         users         |
                              +-----------------------+
                              | id (PK, UUID)         |
                              | name, email, password |
                              | github_url, linkedin  |
                              | created_at            |
                              +-----------+-----------+
                                          |
                     +--------------------+--------------------+
                     | 1:N                                     | 1:N
                     v                                         v
        +-------------------------+               +-------------------------+
        |         resumes         |               |   interview_sessions    |
        +-------------------------+               +-------------------------+
        | id (PK, UUID)           |               | id (PK, UUID)           |
        | user_id (FK -> users)   |               | user_id (FK -> users)   |
        | filename, skills (JSONB)|               | resume_id (FK -> resumes|
        | raw_json (JSONB)        |               | target_role, difficulty |
        | created_at              |               | status, overall_score   |
        +-------------------------+               | technical_score         |
                                                  | comm_score              |
                                                  | knowledge_gaps (JSONB)  |
                                                  | created_at, completed_at|
                                                  +------------+------------+
                                                               |
                                          +--------------------+--------------------+
                                          | 1:N                                     | 1:N
                                          v                                         v
                             +-------------------------+               +-------------------------+
                             |    session_questions    |               |    emotion_snapshots    |
                             +-------------------------+               +-------------------------+
                             | id (PK, UUID)           |               | id (PK, UUID)           |
                             | session_id (FK)         |               | session_id (FK)         |
                             | sequence_num            |               | question_id (FK, opt)   |
                             | topic, question_text    |               | happy, sad, angry       |
                             | answer_text, answer_wpm |               | fearful, surprised      |
                             | technical_score         |               | disgusted, neutral      |
                             | ai_feedback             |               | dominant                |
                             | answered_at             |               | created_at              |
                             +-------------------------+               +-------------------------+
```

### Table Definitions

#### `users`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY, DEFAULT uuid_generate_v4() | Unique user identifier |
| `name` | VARCHAR(100) | NOT NULL | Candidate full name |
| `email` | VARCHAR(255) | UNIQUE, NOT NULL | Normalized lowercase login email |
| `password_hash`| VARCHAR(255) | NOT NULL | Bcrypt hashed password |
| `github_url` | TEXT | NULLABLE | GitHub profile URL |
| `linkedin_url`| TEXT | NULLABLE | LinkedIn profile URL |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Account registration timestamp |

#### `resumes`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Unique resume identifier |
| `user_id` | UUID | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | Associated user |
| `filename` | VARCHAR(255) | NULLABLE | Original uploaded file name |
| `skills` | JSONB | NULLABLE | Array of extracted skill strings |
| `raw_json` | JSONB | NULLABLE | Full parsed resume payload including ATS review |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Upload timestamp |

#### `interview_sessions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Unique interview session identifier |
| `user_id` | UUID | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | Candidate taking the interview |
| `resume_id` | UUID | REFERENCES resumes(id) | Associated resume reference |
| `target_role` | VARCHAR(100) | NULLABLE | Position interviewed for (e.g. Backend Engineer) |
| `difficulty` | VARCHAR(32) | DEFAULT 'medium' | Difficulty tier: `easy`, `medium`, `hard` |
| `status` | VARCHAR(32) | DEFAULT 'active' | Session status: `active`, `completed` |
| `overall_score`| NUMERIC | NULLABLE | Final aggregate score (0–100) |
| `technical_score`| NUMERIC | NULLABLE | Average question technical score |
| `comm_score` | NUMERIC | NULLABLE | Communication and pace cadence score |
| `knowledge_gaps`| JSONB | NULLABLE | Array of identified gaps, severity, recommendations |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Session start timestamp |
| `completed_at`| TIMESTAMPTZ | NULLABLE | Session completion timestamp |

#### `session_questions`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Unique question identifier |
| `session_id` | UUID | NOT NULL, REFERENCES interview_sessions(id) ON DELETE CASCADE | Parent interview session |
| `sequence_num`| INT | NOT NULL | Sequential question order (1 to 12) |
| `topic` | TEXT | NULLABLE | Topic category (e.g. System Design, Concurrency) |
| `question_text`| TEXT | NULLABLE | Text of the interview question |
| `answer_text` | TEXT | NULLABLE | Spoken or typed response from candidate |
| `answer_wpm` | INT | NULLABLE | Words per minute pace recorded for answer |
| `filler_count`| INT | NULLABLE | Count of filler words detected |
| `technical_score`| NUMERIC | NULLABLE | Graded question score (0–100) |
| `ai_feedback` | TEXT | NULLABLE | Evaluator feedback and improvement recommendations |
| `answered_at` | TIMESTAMPTZ | NULLABLE | Answer submission timestamp |

#### `emotion_snapshots`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Unique snapshot record identifier |
| `session_id` | UUID | NOT NULL, REFERENCES interview_sessions(id) ON DELETE CASCADE | Active interview session |
| `question_id`| UUID | REFERENCES session_questions(id) ON DELETE SET NULL | Associated question turn |
| `happy` .. `neutral` | REAL | NULLABLE | Confidence weights (0.0 to 1.0) for each emotion |
| `dominant` | VARCHAR(32) | NULLABLE | Primary emotion detected in frame |
| `created_at` | TIMESTAMPTZ | DEFAULT NOW() | Frame capture timestamp |

#### `github_repos`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PRIMARY KEY | Unique repository record identifier |
| `user_id` | UUID | NOT NULL, REFERENCES users(id) ON DELETE CASCADE | User owning repository link |
| `repo_name` | VARCHAR(255) | NOT NULL | Repository name |
| `repo_url` | TEXT | NULLABLE | GitHub web URL |
| `description` | TEXT | NULLABLE | Repository description |
| `readme_text` | TEXT | NULLABLE | Truncated plaintext of README document |
| `languages` | JSONB | NULLABLE | Programming language breakdown |
| `stars` | INT | DEFAULT 0 | GitHub stargazer count |
| *Constraint* | UNIQUE(user_id, repo_name) | Prevents duplicate repository entries |

#### `system_configs`
| Column | Type | Constraints | Description |
|---|---|---|---|
| `key` | VARCHAR(255) | PRIMARY KEY | Configuration parameter identifier |
| `value` | JSONB | NULLABLE | Dynamic config data (numbers, strings, arrays, objects) |
| `updated_at` | TIMESTAMPTZ | DEFAULT NOW() | Modification timestamp |

---

## 6. API Reference & Communication Protocols

### 6.1 REST Endpoints

All endpoints prefixed with `/api` return standard JSON responses. Authenticated endpoints require an `Authorization: Bearer <jwt_token>` header.

#### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register a new account (`{ name, email, password }`).
- `POST /api/auth/login` — Authenticate credentials (`{ email, password }`); returns `{ token, user }`.
- `GET /api/auth/me` *(Protected)* — Retrieve currently authenticated user profile.

#### Candidate Profile (`/api/profile`)
- `GET /api/profile` *(Protected)* — Fetch user details, resume history, session summary statistics, and indexed GitHub repositories.
- `PATCH /api/profile` *(Protected)* — Update candidate name, GitHub URL, or LinkedIn URL.

#### Resumes (`/api/resume`)
- `POST /api/resume` *(Protected, Multipart)* — Upload a PDF resume (`resume` field). Dispatches to Gemini (with Groq fallbacks), runs ATS evaluation, and stores structured data in database.
- `GET /api/resume/latest/review` *(Protected)* — Retrieve ATS audit, keyword recommendations, bullet point rewrites, and GitHub portfolio review.

#### Interview Sessions (`/api/sessions`)
- `POST /api/sessions` *(Protected)* — Initialize an interview session (`{ resumeId, targetRole, difficulty, githubUrl }`). Triggers asynchronous GitHub repository indexing into ChromaDB.
- `GET /api/sessions` *(Protected)* — List candidate's past interview sessions (limit 50).
- `GET /api/sessions/:id` *(Protected)* — Fetch metadata and parsed resume for a specific session.
- `POST /api/sessions/:id/finalize` *(Protected)* — Conclude an interview, compute aggregate marks, generate knowledge gap analysis via Groq, and set status to `completed`.
- `GET /api/sessions/:id/report` *(Protected)* — Retrieve full diagnostic report data (scores, questions, emotions, pace, and gaps).

#### Audio & Speech-to-Text (`/api/stt`)
- `POST /api/stt` *(Multipart)* — Upload binary audio file (`audio` field). Transcribes via Gemini multimodal audio with automatic fallback to Groq Whisper (`whisper-large-v3`).

#### System & Admin (`/api/admin`)
- `GET /api/health/features` — Public health check reporting configured AI provider keys (`groq`, `assemblyai`, `gemini`, `chroma`).
- `GET /api/admin/system` *(Admin Only)* — List all registered users and interview sessions.
- `POST /api/admin/users` *(Admin Only)* — Manually create a user account.
- `PUT /api/admin/users/:id` *(Admin Only)* — Update a user's name or email.
- `DELETE /api/admin/users/:id` *(Admin Only)* — Delete a user and cascade all associated data.
- `PUT /api/admin/sessions/:id` *(Admin Only)* — Update target role, status, or score for a session.
- `DELETE /api/admin/sessions/:id` *(Admin Only)* — Delete an interview session.
- `GET /api/admin/configs` *(Admin Only)* — Retrieve all dynamic system configuration entries.
- `PUT /api/admin/configs/:key` *(Admin Only)* — Insert or update a configuration key (`{ value }`).

---

### 6.2 WebSocket Protocol (`/ws`)

Real-time interview interactions are coordinated via a persistent WebSocket connection:

| Direction | Message Type | Payload Structure | Description |
|---|---|---|---|
| **Client → Server** | `auth` | `{ token: string }` | Authenticates socket connection with JWT |
| **Server → Client** | `auth_ok` | `{ userId: string }` | Confirms authentication success |
| **Server → Client** | `auth_error`| `{ message: string }` | Reports authentication failure and closes socket |
| **Client → Server** | `start_session` | `{ sessionId, targetRole, resumeJson, difficulty }` | Initiates interview question sequence |
| **Server → Client** | `question` | `{ questionId, questionNumber, totalQuestions, topic, text }` | Delivers generated interview question |
| **Client → Server** | `audio_chunk` | `{ data: base64_pcm_string }` | Streams raw 16kHz audio chunk to STT bridge |
| **Client → Server** | `text_answer`| `{ text: string, wpm: number, duration: number }` | Submits candidate answer (spoken or typed) |
| **Server → Client** | `evaluation`| `{ questionId, score, feedback, wpm }` | Delivers graded score and critique for answer |
| **Client → Server** | `emotion_snapshot` | `{ happy, sad, angry, fearful, surprised, disgusted, neutral }` | Logs facial expression confidence metrics |
| **Server → Client** | `session_end`| `{ message: string }` | Signals that interview questions are complete |
| **Client ↔ Server** | `ping` / `pong` | `{}` | Heartbeat keep-alive check every 25–30 seconds |

---

## 7. Environment Variables Reference

A `.env` configuration file must be present at the workspace root (`AICC/.env`).

```ini
# =================================================================
# Server Configuration
# =================================================================
PORT=5000
NODE_ENV=development                    # Set to 'production' for live deployment
JWT_SECRET=super_secret_jwt_string_change_me
CORS_ORIGIN=http://localhost:5173        # Allowed CORS origin (* or specific URL)
TRUST_PROXY=0                           # Set to 1 if behind reverse proxy (Nginx, Traefik)

# =================================================================
# Database Connections
# =================================================================
# PostgreSQL Connection URL (Postgres 16)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/aicc

# ChromaDB Vector Store HTTP URL
CHROMA_URL=http://localhost:8000

# =================================================================
# AI & Speech Recognition Provider Keys
# =================================================================
# Groq Cloud API Key (LLM Questions, Evals, Whisper STT)
# Obtain from: https://console.groq.com
GROQ_API_KEY=gsk_...
# Optional Groq Model Override (Default: llama-3.3-70b-versatile or openai/gpt-oss-120b)
GROQ_MODEL=llama-3.3-70b-versatile

# Google AI Studio API Key (Multimodal PDF Resume Parsing & STT)
# Obtain from: https://aistudio.google.com
GEMINI_API_KEY=AIzaSy...
# Optional Gemini Model Override (Default: gemini-2.5-flash or gemini-2.0-flash)
GEMINI_MODEL=gemini-2.5-flash

# AssemblyAI API Key (Streaming WebSocket STT)
# Obtain from: https://www.assemblyai.com
ASSEMBLYAI_API_KEY=...
# Optional Speech Model (Default: universal-streaming-english)
ASSEMBLYAI_SPEECH_MODEL=universal-streaming-english

# GitHub Personal Access Token (Optional, increases rate limits for RAG indexing)
GITHUB_TOKEN=ghp_...
```

---

## 8. Installation, Setup & Local Development

### 8.1 Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Docker & Docker Compose**: For PostgreSQL and ChromaDB containers

### 8.2 Step-by-Step Setup Guide

#### 1. Clone & Enter Repository
```bash
git clone https://github.com/your-username/AICC.git
cd AICC
```

#### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your API credentials:
```bash
cp .env.example .env
```

#### 3. Launch Databases via Docker Compose
Start PostgreSQL 16 and ChromaDB in the background:
```bash
docker-compose up -d
```
Verify containers are healthy:
```bash
docker ps
# Expected:
# - postgres:16-alpine on port 5432
# - chromadb/chroma:latest on port 8000
```

#### 4. Install Dependencies
Install root dependencies and frontend dependencies:
```bash
# Install root/backend dependencies
npm install

# Install frontend dependencies
cd Aicc_frontend
npm install
cd ..
```

#### 5. Apply Database Schema & Migrations
Initialize database tables, indices, and the default admin account:
```bash
npm run db:apply
```

#### 6. Run the Application in Development Mode
You can run the backend server and frontend client concurrently:

- **Terminal 1 (Backend Server — Port 5000)**:
  ```bash
  npm run dev
  ```
- **Terminal 2 (Frontend Client — Port 5173)**:
  ```bash
  npm run client
  ```

Visit **`http://localhost:5173`** in your browser.

---

## 9. Default Credentials & Administration

The database bootstrap script automatically registers a default administrator account:
- **Email**: `admin@123`
- **Password**: `admin123`

When logged in with this account:
1. An **"Admin Panel"** navigation button appears on the Dashboard.
2. Admins can access **`/admin`** to manage users, monitor live/completed sessions, and modify runtime system configurations.

---

## 10. Production Deployment Guide

AICC is configured for unified monorepo single-port deployment:

1. **Build Frontend Bundle**:
   ```bash
   npm run build
   ```
   This generates optimized static production assets in `Aicc_frontend/dist`.

2. **Set Environment Mode**:
   Set `NODE_ENV=production` in `.env`.

3. **Start Production Server**:
   ```bash
   npm run start:prod
   ```
   In production mode, the Express server on port `5000`:
   - Enforces Helmet security headers.
   - Serves the compiled React SPA from `Aicc_frontend/dist` on all non-API routes.
   - Handles all `/api/*` REST traffic.
   - Hosts the WebSocket engine on `/ws`.

---

## 11. Security, Resilience & Error Handling

- **Tiered STT & Parsing Fallbacks**: If Google Gemini is suspended or encounters rate limits, the system seamlessly falls back to Groq Whisper for audio and `pdf-parse` + Groq for resume extraction, preventing user disruptions.
- **Model Fallbacks**: The Groq service layer automatically cascades through alternative models (`llama-3.3-70b-versatile` → `openai/gpt-oss-120b` → `openai/gpt-oss-20b` → `qwen/qwen3.8-27b`) if a specific model returns a 404 or deprecation error.
- **Sanitized JSON Repair**: Groq and Gemini responses pass through a custom JSON bracket balancer (`safeParseJson`) to handle unclosed markdown code fences or truncated LLM output strings.
- **WebSocket Health & Auto-Recovery**: Client and server exchange heartbeat pings every 25–30 seconds. If a connection drops unexpectedly, the client automatically attempts reconnection after 3 seconds.
- **Rate Limiting & Authentication**: Login and registration endpoints are protected with sliding-window rate limiters. Passwords are encrypted with 10-round bcrypt hashes, and all protected endpoints require verified JWT bearer tokens.
