"use strict";
const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { query } = require("../db/connection");
const { generateFirstQuestion, generateFollowUpQuestion, evaluateAnswer } = require("../services/groq");

// Message type constants
const MSG = {
  AUTH: "auth",
  AUTH_OK: "auth_ok",
  AUTH_ERR: "auth_error",
  START: "start_session",
  AUDIO_CHUNK: "audio_chunk",
  TRANSCRIPT_PARTIAL: "transcript_partial",
  TRANSCRIPT_FINAL: "transcript_final",
  QUESTION: "question",
  EVALUATION: "evaluation",
  EMOTION: "emotion_snapshot",
  FILLER: "filler_update",
  ERROR: "error",
  SESSION_END: "session_end",
  PING: "ping",
  PONG: "pong",
  TEXT_ANSWER: "text_answer",
};

// Per-connection state
function createSessionState() {
  return {
    userId: null,
    sessionId: null,
    resumeJson: null,
    targetRole: null,
    userName: null,
    questionNumber: 0,
    currentQuestionId: null,
    currentQuestion: null,
    currentTopic: null,
    conversationHistory: [],
    currentTranscript: "",
    deepgramWs: null,
    isRecording: false,
    fillerTotals: {},
    emotionBuffer: [],
  };
}

function send(ws, type, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

function authenticateToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    return null;
  }
}

function connectDeepgram(state, ws) {
  const key = process.env.DEEPGRAM_API_KEY?.trim();
  if (!key) {
    send(ws, MSG.ERROR, {
      message:
        "Live transcription needs DEEPGRAM_API_KEY in server .env (see console.deepgram.com). Questions still work; scoring triggers after Deepgram detects end of speech.",
    });
    return Promise.resolve();
  }

  const dgUrl = [
    "wss://api.deepgram.com/v1/listen",
    "?model=nova-2",
    "&language=en-US",
    "&encoding=linear16",
    "&sample_rate=16000",
    "&channels=1",
    "&interim_results=true",
    "&utterance_end_ms=1200",
    "&vad_events=true",
    "&smart_format=true",
  ].join("");

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    const dgWs = new WebSocket(dgUrl, {
      headers: { Authorization: `Token ${key}` },
    });

    dgWs.on("open", () => {
      console.log(`[DG] Connected for session ${state.sessionId}`);
      state.isRecording = true;
      done();
    });

    dgWs.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === "Results") {
          const alt = msg.channel?.alternatives?.[0];
          if (!alt?.transcript) return;
          if (msg.is_final) {
            const finalText = alt.transcript.trim();
            if (finalText) {
              state.currentTranscript += " " + finalText;
              const wordCount = finalText.split(/\s+/).length;
              const duration = (msg.duration || 5);
              const wpm = Math.round((wordCount / duration) * 60);
              const fillers = ["um", "uh", "like", "basically", "you know", "sort of", "right", "literally"];
              const lowerText = finalText.toLowerCase();
              for (const f of fillers) {
                const cnt = (lowerText.match(new RegExp(`\\b${f}\\b`, "g")) || []).length;
                if (cnt > 0) state.fillerTotals[f] = (state.fillerTotals[f] || 0) + cnt;
              }
              send(ws, MSG.TRANSCRIPT_FINAL, { text: finalText, wpm, fillers: state.fillerTotals });
            }
          } else {
            send(ws, MSG.TRANSCRIPT_PARTIAL, { text: alt.transcript });
          }
        } else if (msg.type === "UtteranceEnd") {
          if (state.currentTranscript.trim().length > 20) {
            await handleAnswerComplete(state, ws);
          }
        }
      } catch (err) {
        console.error("[DG] Parse error:", err.message);
      }
    });

    dgWs.on("error", (err) => {
      console.error("[DG] WebSocket error:", err.message);
      send(ws, MSG.ERROR, {
        message: `Deepgram failed: ${err.message}. Verify DEEPGRAM_API_KEY and project billing.`,
      });
      done();
    });

    dgWs.on("close", () => {
      state.isRecording = false;
      console.log(`[DG] Closed for session ${state.sessionId}`);
    });

    state.deepgramWs = dgWs;

    setTimeout(() => {
      if (!settled) {
        send(ws, MSG.ERROR, { message: "Deepgram connection timed out after 15s. Check API key and network." });
        done();
      }
    }, 15000);
  });
}

async function handleAnswerComplete(state, ws) {
  const answerText = state.currentTranscript.trim();
  if (!answerText || !state.currentQuestionId) return;
  state.currentTranscript = "";

  // Evaluate answer
  const evaluation = await evaluateAnswer(
    state.currentQuestion,
    answerText,
    state.currentTopic,
    state.targetRole
  );

  // Persist answer + evaluation
  await query(
    `UPDATE session_questions
     SET answer_text = $1, answer_wpm = $2, filler_count = $3,
         technical_score = $4, ai_feedback = $5, answered_at = NOW()
     WHERE id = $6`,
    [
      answerText,
      evaluation.estimatedWpm || 0,
      evaluation.fillerCount || 0,
      evaluation.score,
      evaluation.feedback,
      state.currentQuestionId,
    ]
  );

  // Add to conversation history
  state.conversationHistory.push(
    { role: "assistant", content: state.currentQuestion },
    { role: "user", content: answerText }
  );

  send(ws, MSG.EVALUATION, {
    questionId: state.currentQuestionId,
    score: evaluation.score,
    feedback: evaluation.feedback,
    fillerWords: evaluation.fillerWords,
    wpm: evaluation.estimatedWpm,
  });

  // Generate next question (max 12)
  state.questionNumber++;
  if (state.questionNumber >= 12) {
    send(ws, MSG.SESSION_END, { message: "Interview complete. Generating your report..." });
    return;
  }

  setTimeout(() => generateAndSendQuestion(state, ws), 1500);
}

async function generateAndSendQuestion(state, ws) {
  try {
    let result;
    if (state.questionNumber === 0) {
      result = await generateFirstQuestion({
        targetRole: state.targetRole,
        resumeJson: state.resumeJson,
        userName: state.userName,
      });
    } else {
      result = await generateFollowUpQuestion({
        sessionId: state.sessionId,
        userId: state.userId,
        targetRole: state.targetRole,
        resumeJson: state.resumeJson,
        conversationHistory: state.conversationHistory,
        currentTopic: state.currentTopic,
        questionNumber: state.questionNumber,
      });
    }

    state.currentQuestion = result.question;
    state.currentTopic = result.topic;

    // Persist question to DB
    const qResult = await query(
      `INSERT INTO session_questions (session_id, sequence_num, topic, question_text)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [state.sessionId, state.questionNumber + 1, result.topic, result.question]
    );
    state.currentQuestionId = qResult.rows[0].id;

    send(ws, MSG.QUESTION, {
      questionId: state.currentQuestionId,
      questionNumber: state.questionNumber + 1,
      totalQuestions: 12,
      topic: result.topic,
      text: result.question,
    });
  } catch (err) {
    console.error("[WS] Question generation failed:", err);
    const raw = err?.message || err?.error?.message || String(err);
    const hint =
      /api[_ ]?key|401|invalid|unauthorized|GROQ/i.test(raw) ? " Set GROQ_API_KEY in server .env (console.groq.com). Optional: GROQ_MODEL=llama-3.1-8b-instant" : "";
    send(ws, MSG.ERROR, { message: `Interview AI: ${raw}${hint}` });
  }
}

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    console.log(`[WS] New connection from ${req.socket.remoteAddress}`);
    const state = createSessionState();

    // Heartbeat
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) { return; }

      switch (msg.type) {
        case MSG.AUTH: {
          const payload = authenticateToken(msg.token);
          if (!payload) {
            send(ws, MSG.AUTH_ERR, { message: "Invalid token" });
            ws.close();
            return;
          }
          state.userId = String(payload.sub);
          state.userName = payload.name || "Candidate";
          send(ws, MSG.AUTH_OK, { userId: state.userId });
          break;
        }

        case MSG.START: {
          if (!state.userId) { send(ws, MSG.ERROR, { message: "Not authenticated" }); return; }
          state.sessionId = msg.sessionId;
          state.targetRole = msg.targetRole || "Backend Engineer";
          state.resumeJson = msg.resumeJson || {};
          state.questionNumber = 0;
          state.conversationHistory = [];

          (async () => {
            try {
              if (!process.env.GROQ_API_KEY?.trim()) {
                send(ws, MSG.ERROR, {
                  message: "Server missing GROQ_API_KEY in .env. Add a key from console.groq.com to generate questions.",
                });
                return;
              }
              await connectDeepgram(state, ws);
              await generateAndSendQuestion(state, ws);
            } catch (err) {
              console.error("[WS] START failed:", err);
              send(ws, MSG.ERROR, { message: err.message || "Failed to start interview" });
            }
          })();
          break;
        }

        case MSG.AUDIO_CHUNK: {
          // Forward raw audio bytes to Deepgram
          if (state.deepgramWs?.readyState === WebSocket.OPEN && msg.data) {
            const buf = Buffer.from(msg.data, "base64");
            state.deepgramWs.send(buf);
          }
          break;
        }

        case MSG.TEXT_ANSWER: {
          if (!state.sessionId || !msg.text) return;
          state.currentTranscript = msg.text;
          await handleAnswerComplete(state, ws);
          break;
        }

        case MSG.EMOTION: {
          if (!state.sessionId) return;
          const { happy = 0, sad = 0, angry = 0, fearful = 0, surprised = 0, disgusted = 0, neutral = 0 } = msg;
          const dominant = Object.entries({ happy, sad, angry, fearful, surprised, disgusted, neutral })
            .sort((a, b) => b[1] - a[1])[0][0];
          await query(
            `INSERT INTO emotion_snapshots (session_id, question_id, happy, sad, angry, fearful, surprised, disgusted, neutral, dominant)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
            [state.sessionId, state.currentQuestionId, happy, sad, angry, fearful, surprised, disgusted, neutral, dominant]
          );
          break;
        }

        case MSG.PING:
          send(ws, MSG.PONG, {});
          break;
      }
    });

    ws.on("close", () => {
      if (state.deepgramWs) state.deepgramWs.close();
      console.log(`[WS] Connection closed for user ${state.userId}`);
    });

    ws.on("error", (err) => console.error("[WS] Error:", err.message));
  });

  // Heartbeat interval
  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => clearInterval(heartbeat));
  console.log("[WS] WebSocket server ready at /ws");
  return wss;
}

module.exports = { setupWebSocket };
