# AICC (Artificial Intelligence Candidate Coaching)

A modern full-stack application designed to conduct fully automated, AI-driven technical interviews. By leveraging advanced language models and real-time audio analysis, AICC evaluates a candidate based on their resume, their GitHub activity, and their real-time responses to dynamic technical questions.

![AICC Overview](placeholder.png) <!-- Feel free to add an actual project image here -->

## ✨ Features

- **Automated Resume Parsing**: Upload a PDF resume and the system will automatically parse skills, experience, and projects using Google Gemini.
- **Dynamic Interview Questions**: Generated specifically for your target role and tailored to your resume experience.
- **Real-time Feedback**: Evaluates live responses on technical accuracy, word count, fillers, and identifies key strengths and knowledge gaps.
- **GitHub Profile Analysis**: Integrates with your GitHub profile (via Retrieval-Augmented Generation) to analyze open source activity and incorporate it into the interview context.
- **Admin Dashboard**: A comprehensive admin panel to view all users, manage active interview sessions, and configure dynamic real-time system configurations.

## 🛠 Tech Stack

- **Frontend**: React, Vite, React Router, TailwindCSS
- **Backend**: Node.js, Express, WebSocket
- **Database**: PostgreSQL (for users, sessions, configurations) & ChromaDB (for RAG embeddings)
- **AI/LLMs**: 
  - [Groq](https://groq.com/) (Llama-3) for fast interview conversational logic and evaluation.
  - [Google Gemini](https://ai.google.dev/) for structured resume parsing.
  - [AssemblyAI](https://www.assemblyai.com/) for real-time live Voice & Speech transcription mapping and evaluation.

---

## 🚀 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (v16+)
- [Docker](https://www.docker.com/) (for PostgreSQL and ChromaDB)
- API Keys: `GROQ_API_KEY`, `GEMINI_API_KEY`

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/your-username/AICC.git
   cd AICC
   ```

2. **Start the Databases**
   We use Docker Compose to run Postgres and ChromaDB.
   ```bash
   docker-compose up -d
   ```

3. **Backend Setup**
   ```bash
   cd Aicc_backend
   npm install
   
   # Setup environment variables
   # Create a .env file in the root directory (AICC/.env)
   # Copy the base config from .env.example
   
   # Apply database schema
   npm run db:apply
   
   # Start the backend server (Runs on port 5000)
   npm run dev
   ```

4. **Frontend Setup**
   ```bash
   cd ../Aicc_frontend
   npm install
   
   # Start the React dev server
   npm run dev
   ```

---

## 🔑 Environment Variables
Make sure you create a `.env` file at the root of the project:

```env
# Server
PORT=5000
JWT_SECRET=super_secret_jwt_string_change_me
CORS_ORIGIN=http://localhost:5173

# Databases
DATABASE_URL=postgres://postgres:postgres@localhost:5432/aicc
CHROMA_URL=http://localhost:8000

# AI APIs
GROQ_API_KEY=your_groq_key
GEMINI_API_KEY=your_gemini_key
ASSEMBLYAI_API_KEY=your_assemblyai_key
```

## 👨‍💻 Admin Setup
The system automatically creates an Admin account on first start with the following credentials:
- **Email**: `admin@123`
- **Password**: `admin123`

You can use the Admin Dashboard to visualize user runs and add system configurations dynamically (e.g. strictness settings, prompts, tokens).

## 📄 License
MIT License
