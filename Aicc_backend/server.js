"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const http = require("http");
const path = require("path");
const fs = require("fs");
const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const { query } = require("../db/connection");
const { authenticate } = require("../middleware/auth");
const { setupWebSocket } = require("./handler");
const profileRouter = require("./profile");
const { parseResumeWithGemini } = require("./gemini");
const { indexGithubRepos } = require("./rag");
const { generateReport, generateKnowledgeGapAnalysis } = require("./report");

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const isProd = process.env.NODE_ENV === "production";

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

if (process.env.TRUST_PROXY === "1") {
  app.set("trust proxy", 1);
}

if (!process.env.JWT_SECRET || !String(process.env.JWT_SECRET).trim()) {
  console.error("Set JWT_SECRET in .env (any long random string).");
  process.exit(1);
}
if (!process.env.DATABASE_URL || !String(process.env.DATABASE_URL).trim()) {
  console.error("Set DATABASE_URL in .env (see .env.example).");
  process.exit(1);
}

const corsOrigin = process.env.CORS_ORIGIN;
app.use(
  cors({
    origin: corsOrigin === "*" ? true : corsOrigin || true,
    credentials: true,
  })
);
if (isProd) {
  try {
    const helmet = require("helmet");
    app.use(
      helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      })
    );
  } catch (_) {
    console.warn("[Server] Install `helmet` for production security headers.");
  }
}
app.use(express.json({ limit: "2mb" }));

let authRoute = [];
try {
  const createLimit = require("express-rate-limit");
  const limitFn = typeof createLimit === "function" ? createLimit : createLimit.default || createLimit.rateLimit;
  if (typeof limitFn === "function") {
    authRoute = [
      limitFn({
        windowMs: 15 * 60 * 1000,
        max: isProd ? 30 : 200,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: "Too many attempts. Try again later." },
      }),
    ];
  }
} catch (_) { /* optional dep */ }

const uploadDir = path.join(__dirname, "..", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({ dest: uploadDir });

function signUser(user) {
  return jwt.sign(
    { sub: String(user.id), name: user.name },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

app.get("/api/health/features", (req, res) => {
  res.json({
    groq: Boolean(process.env.GROQ_API_KEY?.trim()),
    deepgram: Boolean(process.env.DEEPGRAM_API_KEY?.trim()),
    gemini: Boolean(process.env.GEMINI_API_KEY?.trim()),
    chroma: Boolean(process.env.CHROMA_URL?.trim()),
  });
});

// Seed admin
(async () => {
  try {
    const adminHash = await bcrypt.hash("admin123", 10);
    await query(`
      INSERT INTO users (id, name, email, password_hash)
      VALUES ($1, 'Administrator', 'admin@123', $2)
      ON CONFLICT (email) DO NOTHING
    `, [uuidv4(), adminHash]);
  } catch (err) {
    console.error("[Server] Admin seed error:", err.message);
  }
})();

const requireAdmin = (req, res, next) => {
  if (req.user.email !== "admin@123") return res.status(403).json({ error: "Forbidden: Admin only" });
  next();
};

app.post("/api/auth/register", ...authRoute, async (req, res, next) => {
  try {
    const { name, email, password } = req.body || {};
    const emailNorm = normalizeEmail(email);
    const nameTrim = String(name ?? "").trim();
    if (!nameTrim || !emailNorm || !password) return res.status(400).json({ error: "Missing fields" });
    if (password.length < 8) return res.status(400).json({ error: "Password too short" });
    const hash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await query(
      "INSERT INTO users (id, name, email, password_hash) VALUES ($1, $2, $3, $4)",
      [id, nameTrim, emailNorm, hash]
    );
    const user = { id, name: nameTrim, email: emailNorm };
    res.json({ token: signUser(user), user });
  } catch (err) {
    if (err.code === "23505") return res.status(400).json({ error: "Email already registered" });
    next(err);
  }
});

app.post("/api/auth/login", ...authRoute, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = normalizeEmail(email);
    if (!emailNorm || !password) return res.status(400).json({ error: "Missing fields" });
    const r = await query(
      "SELECT id, name, email, password_hash FROM users WHERE email = $1",
      [emailNorm]
    );
    const row = r.rows[0];
    const hash = row?.password_hash;
    const ok = hash && typeof hash === "string" && (await bcrypt.compare(password, hash));
    if (!row || !ok) {
      return res.status(401).json({ error: "Invalid email or password" });
    }
    const user = { id: String(row.id), name: row.name, email: row.email };
    res.json({ token: signUser(user), user });
  } catch (err) { next(err); }
});

app.get("/api/auth/me", authenticate, async (req, res, next) => {
  try {
    const r = await query("SELECT id, name, email, github_url, linkedin_url FROM users WHERE id = $1", [req.user.id]);
    res.json({ user: r.rows[0] });
  } catch (err) { next(err); }
});

app.use("/api/profile", profileRouter);

app.post("/api/resume", authenticate, upload.single("resume"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const parsed = await parseResumeWithGemini(req.file.path);
    try { fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    
    // --- Realtime Resume Evaluation ---
    const { generateResumeReview } = require("./groq");
    const review = await generateResumeReview(parsed);
    parsed.review = review;
    // ----------------------------------

    const id = uuidv4();
    await query(
      `INSERT INTO resumes (id, user_id, filename, skills, raw_json)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, req.user.id, req.file.originalname || "resume.pdf", JSON.stringify(parsed.skills || []), JSON.stringify(parsed)]
    );
    res.json({ resume: { id, skills: parsed.skills, raw_json: parsed } });
  } catch (err) {
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch (_) { /* ignore */ }
    const msg = err?.message || String(err);
    if (/GEMINI_API_KEY|API key|401|403/i.test(msg)) {
      return res.status(503).json({ error: "Resume parsing needs a valid GEMINI_API_KEY in server .env." });
    }
    next(err);
  }
});

app.get("/api/resume/latest/review", authenticate, async (req, res, next) => {
  try {
    const check = await query("SELECT raw_json FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1", [req.user.id]);
    if (!check.rows.length) return res.status(404).json({ error: "No resume found. Please upload one first." });
    
    let raw_json = {};
    try {
      if (check.rows[0].raw_json) {
        raw_json = typeof check.rows[0].raw_json === "string" ? JSON.parse(check.rows[0].raw_json) : check.rows[0].raw_json;
      }
    } catch (_) {}
    
    if (raw_json.review) {
      return res.json(raw_json.review);
    }
    
    // Fallback if not baked in yet
    const { generateResumeReview } = require("./groq");
    const review = await generateResumeReview(raw_json);
    res.json(review);
  } catch (err) { next(err); }
});

app.post("/api/sessions", authenticate, async (req, res, next) => {
  try {
    const { resumeId, targetRole, githubUrl } = req.body || {};
    if (!resumeId || !targetRole) return res.status(400).json({ error: "resumeId and targetRole required" });
    const check = await query("SELECT id FROM resumes WHERE id = $1 AND user_id = $2", [resumeId, req.user.id]);
    if (!check.rows.length) return res.status(404).json({ error: "Resume not found" });
    if (githubUrl) {
      await query("UPDATE users SET github_url = $1 WHERE id = $2", [githubUrl, req.user.id]);
      indexGithubRepos(req.user.id, githubUrl).catch((e) => console.warn("[RAG] Background index:", e.message));
    }
    const id = uuidv4();
    await query(
      `INSERT INTO interview_sessions (id, user_id, resume_id, target_role, status)
       VALUES ($1, $2, $3, $4, 'active')`,
      [id, req.user.id, resumeId, targetRole]
    );
    res.json({ session: { id, target_role: targetRole, status: "active" } });
  } catch (err) { next(err); }
});

app.get("/api/sessions", authenticate, async (req, res, next) => {
  try {
    const r = await query(
      `SELECT id, target_role, status, overall_score, created_at, completed_at
       FROM interview_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ sessions: r.rows });
  } catch (err) { next(err); }
});

app.get("/api/sessions/:id", authenticate, async (req, res, next) => {
  try {
    const sid = req.params.id;
    const s = await query(
      `SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2`,
      [sid, req.user.id]
    );
    if (!s.rows.length) return res.status(404).json({ error: "Not found" });
    const session = s.rows[0];
    let resume = null;
    if (session.resume_id) {
      const rr = await query("SELECT id, raw_json FROM resumes WHERE id = $1", [session.resume_id]);
      resume = rr.rows[0] || null;
    }
    let raw_json = {};
    try {
      if (resume?.raw_json) raw_json = typeof resume.raw_json === "string" ? JSON.parse(resume.raw_json) : resume.raw_json;
    } catch (_) { raw_json = {}; }
    res.json({ session, resume: resume ? { id: resume.id, raw_json } : null });
  } catch (err) { next(err); }
});

app.post("/api/sessions/:id/finalize", authenticate, async (req, res, next) => {
  try {
    const sid = req.params.id;
    const s = await query(
      "SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2",
      [sid, req.user.id]
    );
    if (!s.rows.length) return res.status(404).json({ error: "Not found" });
    const session = s.rows[0];
    const scores = await generateReport(sid);
    const gaps = await generateKnowledgeGapAnalysis(sid, session.target_role || "Engineer");
    await query(
      `UPDATE interview_sessions
       SET status = 'completed', overall_score = $1, technical_score = $2, comm_score = $3,
           knowledge_gaps = $4, completed_at = NOW()
       WHERE id = $5`,
      [scores.overallScore, scores.technicalScore, scores.commScore, JSON.stringify(gaps), sid]
    );
    res.json({ ok: true, ...scores, knowledgeGaps: gaps });
  } catch (err) { next(err); }
});

app.get("/api/sessions/:id/report", authenticate, async (req, res, next) => {
  try {
    const sid = req.params.id;
    const s = await query(
      "SELECT * FROM interview_sessions WHERE id = $1 AND user_id = $2",
      [sid, req.user.id]
    );
    if (!s.rows.length) return res.status(404).json({ error: "Not found" });
    const session = s.rows[0];
    const qres = await query(
      "SELECT * FROM session_questions WHERE session_id = $1 ORDER BY sequence_num",
      [sid]
    );
    let knowledgeGaps = [];
    try {
      knowledgeGaps = typeof session.knowledge_gaps === "string"
        ? JSON.parse(session.knowledge_gaps)
        : session.knowledge_gaps || [];
    } catch (_) { knowledgeGaps = []; }

    const eRes = await query(`
      SELECT dominant, COUNT(*) as count 
      FROM emotion_snapshots 
      WHERE session_id = $1 
      GROUP BY dominant 
      ORDER BY count DESC
    `, [sid]);

    res.json({
      session,
      overallScore: session.overall_score,
      technicalScore: session.technical_score,
      commScore: session.comm_score,
      knowledgeGaps,
      emotions: eRes.rows,
      questions: qres.rows,
    });
  } catch (err) { next(err); }
});

function apiErrorMessage(err) {
  const code = err.code || err.cause?.code;
  const text = `${err.message || ""} ${err.cause?.message || ""}`;
  if (code === "ECONNREFUSED" || code === "57P01" || /ECONNREFUSED/i.test(text))
    return "Cannot connect to PostgreSQL. Start the database, then set DATABASE_URL in .env (try: docker compose up -d, then npm run db:apply).";
  if (code === "3D000")
    return 'Database does not exist. Create it (e.g. CREATE DATABASE aicc;) or fix DATABASE_URL in .env.';
  if (code === "42P01")
    return 'Tables are missing. From the AICC folder run: npm run db:apply';
  if (code === "28P01")
    return "PostgreSQL rejected the password in DATABASE_URL. Check username and password.";
  const msg = err.message || (Array.isArray(err.errors) && err.errors[0]?.message) || err.cause?.message;
  return msg || "Server error";
}

// --- ADMIN ENDPOINTS ---

app.get("/api/admin/system", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const users = await query("SELECT id, name, email, created_at FROM users ORDER BY created_at DESC");
    const sessions = await query(`
      SELECT s.id, u.email as user_email, s.target_role, s.status, s.overall_score, s.created_at
      FROM interview_sessions s
      JOIN users u ON s.user_id = u.id
      ORDER BY s.created_at DESC
    `);
    res.json({ users: users.rows, sessions: sessions.rows });
  } catch (err) { next(err); }
});

app.delete("/api/admin/users/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Cannot delete self" });
    await query("DELETE FROM users WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.delete("/api/admin/sessions/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    await query("DELETE FROM interview_sessions WHERE id = $1", [req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.post("/api/admin/users", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Name, email, and password required" });
    const bcrypt = require("bcrypt");
    const hash = await bcrypt.hash(password, 10);
    const { v4: uuidv4 } = require("uuid");
    
    await query(`
      INSERT INTO users (id, name, email, password_hash) 
      VALUES ($1, $2, $3, $4)
    `, [uuidv4(), name, email, hash]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.put("/api/admin/users/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { name, email } = req.body;
    if (!name || !email) return res.status(400).json({ error: "Name and email required" });
    
    await query(`
      UPDATE users SET name = $1, email = $2 WHERE id = $3
    `, [name, email, req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

app.put("/api/admin/sessions/:id", authenticate, requireAdmin, async (req, res, next) => {
  try {
    const { target_role, status, overall_score } = req.body;
    
    await query(`
      UPDATE interview_sessions 
      SET target_role = $1, status = $2, overall_score = $3 
      WHERE id = $4
    `, [target_role, status, overall_score, req.params.id]);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// -----------------------

const distPath = path.join(__dirname, "..", "Aicc_frontend", "dist");
if (isProd && fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "Not found" });
    }
    res.sendFile(path.join(distPath, "index.html"));
  });
}

app.use((err, req, res, next) => {
  console.error(err);
  const code = err.code || err.cause?.code;
  const text = `${err.message || ""} ${err.cause?.message || ""}`;
  const isDbIssue =
    code === "ECONNREFUSED" ||
    code === "3D000" ||
    code === "42P01" ||
    code === "57P01" ||
    code === "28P01" ||
    /ECONNREFUSED/i.test(text);
  res.status(isDbIssue ? 503 : 500).json({ error: apiErrorMessage(err) });
});

const server = http.createServer(app);
setupWebSocket(server);

server.listen(PORT, () => {
  const mode = isProd ? "production" : "development";
  console.log(`AICC (${mode}) API + WS on port ${PORT}`);
  if (isProd && fs.existsSync(distPath)) {
    console.log(`Serving SPA from ${distPath}`);
  } else if (isProd) {
    console.warn("Production mode but Aicc_frontend/dist missing — run: npm run build:client");
  }
});
