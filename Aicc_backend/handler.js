"use strict";
/**
 * Live WebSocket Connection Handler & Interview Orchestration Engine
 * 
 * This module manages real-time interactions during active interview sessions.
 * Key responsibilities:
 * 1. Establishes client WebSocket connections for bi-directional messaging.
 * 2. Authenticates connections via JWT credentials.
 * 3. Bridges audio data stream to AssemblyAI for real-time transcription.
 * 4. Extracts speech analytics (filler word counts, speaking pace/WPM) from transcriptions.
 * 5. Coordinates LLM question generation (first question vs. contextual follow-ups).
 * 6. Invokes LLM evaluations for completed responses.
 * 7. Logs candidate emotional state snapshots captured from the webcam face detector.
 */

const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const { query } = require("../db/connection");
const { generateFirstQuestion, generateFollowUpQuestion, evaluateAnswer } = require("../services/groq");

// Message type constants defining the WebSocket communication protocol
const MSG = {
  AUTH: "auth",                      // Incoming: Client authentication request with token
  AUTH_OK: "auth_ok",                // Outgoing: Authentication successful
  AUTH_ERR: "auth_error",            // Outgoing: Authentication failed
  START: "start_session",            // Incoming: Begin interview logic
  AUDIO_CHUNK: "audio_chunk",        // Incoming: Raw binary audio chunk from user microphone
  TRANSCRIPT_PARTIAL: "transcript_partial", // Outgoing: Unstable, real-time transcription segment
  TRANSCRIPT_FINAL: "transcript_final",     // Outgoing: Finalized transcription segment
  QUESTION: "question",              // Outgoing: Next interview question details
  EVALUATION: "evaluation",          // Outgoing: Feedback score & critique for the last answer
  EMOTION: "emotion_snapshot",       // Incoming: Face detection emotion confidence scores
  FILLER: "filler_update",           // Outgoing: Running counts of filler words used
  ERROR: "error",                    // Outgoing: Server/API error notification
  SESSION_END: "session_end",        // Outgoing: Session completion signal
  PING: "ping",                      // Incoming: Client heartbeat check
  PONG: "pong",                      // Outgoing: Server heartbeat response
  TEXT_ANSWER: "text_answer",        // Incoming: Textual input fallback response
};

/**
 * Initializes and returns a fresh, isolated state object for a single connection.
 * Tracks session parameters, conversation history, and audio transcription states.
 * 
 * @returns {Object} Connection-specific state object
 */
function createSessionState() {
  return {
    userId: null,                 // Authenticated user UUID
    sessionId: null,              // Active interview session UUID
    resumeJson: null,             // Parsed resume JSON data structure used for context
    targetRole: null,             // Job role being interviewed for
    userName: null,               // Candidate's name (extracted from JWT)
    questionNumber: 0,            // Counter tracking completed questions
    currentQuestionId: null,      // Database ID of the active question
    currentQuestion: null,        // Text of the active question
    currentTopic: null,           // Current interview topic (e.g. Databases, System Design)
    conversationHistory: [],      // Array of previous dialog turns: [{ role, content }]
    currentTranscript: "",        // Accumulator for finalized transcripts of the current response
    deepgramWs: null,             // WebSocket instance connected to AssemblyAI
    isRecording: false,           // Status flag of the audio capture pipeline
    fillerTotals: {},             // Map of filler word counts for the current answer session
    emotionBuffer: [],            // Buffer storing emotion snapshots before scoring
  };
}

/**
 * Helper to dispatch JSON-formatted messages to the client.
 * 
 * @param {WebSocket} ws - Client WebSocket instance
 * @param {string} type - Message type string (from MSG enum)
 * @param {Object} payload - Data payload to merge into the message
 */
function send(ws, type, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
}

/**
 * Verifies the integrity of the client-supplied JWT authentication token.
 * 
 * @param {string} token - JWT token string from MSG.AUTH request
 * @returns {Object|null} Decoded token payload if valid, null otherwise
 */
function authenticateToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (_) {
    return null;
  }
}

/**
 * Establishes a connection to the AssemblyAI streaming transcription service.
 * Handles incoming audio chunks, performs real-time speech-to-text, and monitors
 * for natural pauses indicating the user has completed their answer.
 * 
 * @param {Object} state - Isolated connection state object
 * @param {WebSocket} ws - Client WebSocket instance
 * @returns {Promise<void>} Resolves when connection is established or skipped
 */
function connectAssemblyAI(state, ws) {
  const key = process.env.ASSEMBLYAI_API_KEY?.trim();
  if (!key) {
    // Notify client that voice features are disabled but typing fallback remains active
    send(ws, MSG.ERROR, {
      message:
        "Live transcription needs ASSEMBLYAI_API_KEY in server .env (see console.assemblyai.com). Questions still work; scoring triggers after AssemblyAI detects end of speech.",
    });
    return Promise.resolve();
  }

  const speechModel = process.env.ASSEMBLYAI_SPEECH_MODEL?.trim() || "universal-streaming-english";
  const dgUrl = `wss://streaming.assemblyai.com/v3/ws?sample_rate=16000&speech_model=${speechModel}`;

  return new Promise((resolve) => {
    let settled = false;
    const done = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    // Open connection to AssemblyAI WebSocket API
    const dgWs = new WebSocket(dgUrl, {
      headers: { Authorization: key },
    });

    dgWs.on("open", () => {
      console.log(`[AssemblyAI] Connected for session ${state.sessionId}`);
      state.isRecording = true;
      done();
    });

    dgWs.on("message", async (data) => {
      try {
        const msg = JSON.parse(data.toString());
        
        // Handle intermediate transcription results (displayed in UI as the user speaks)
        if (msg.message_type === "PartialTranscript") {
          send(ws, MSG.TRANSCRIPT_PARTIAL, { text: msg.text });
        } 
        // Handle finalized sentences from AssemblyAI's voice activity detection
        else if (msg.message_type === "FinalTranscript") {
          const finalText = msg.text.trim();
          if (finalText) {
            // Append final segment to current response accumulator
            state.currentTranscript += " " + finalText;
            
            // Calculate words-per-minute pace for this segment
            const wordCount = finalText.split(/\s+/).length;
            const duration = (msg.audio_end - msg.audio_start) / 1000 || 5;
            const wpm = Math.round((wordCount / duration) * 60) || 120;
            
            // Scan for filler word frequencies
            const fillers = ["um", "uh", "like", "basically", "you know", "sort of", "right", "literally"];
            const lowerText = finalText.toLowerCase();
            for (const f of fillers) {
              const cnt = (lowerText.match(new RegExp(`\\b${f}\\b`, "g")) || []).length;
              if (cnt > 0) state.fillerTotals[f] = (state.fillerTotals[f] || 0) + cnt;
            }
            
            // Send feedback update containing metrics
            send(ws, MSG.TRANSCRIPT_FINAL, { text: finalText, wpm, fillers: state.fillerTotals });
          }
          
          // If response length is significant, evaluate response (represents end-of-speech pause)
          if (state.currentTranscript.trim().length > 20) {
            await handleAnswerComplete(state, ws);
          }
        } else if (msg.error) {
          console.error("[AssemblyAI] Error from API:", msg.error);
        }
      } catch (err) {
        console.error("[AssemblyAI] Parse error:", err.message);
      }
    });

    dgWs.on("error", (err) => {
      console.error("[AssemblyAI] WebSocket error:", err.message);
      send(ws, MSG.ERROR, {
        message: `AssemblyAI failed: ${err.message}. Verify ASSEMBLYAI_API_KEY and project billing.`,
      });
      done();
    });

    dgWs.on("close", () => {
      state.isRecording = false;
      console.log(`[AssemblyAI] Closed for session ${state.sessionId}`);
    });

    state.deepgramWs = dgWs;

    // Safety timeout to prevent stalling the client onboarding flow if AssemblyAI hangs
    setTimeout(() => {
      if (!settled) {
        send(ws, MSG.ERROR, { message: "Deepgram connection timed out after 15s. Check API key and network." });
        done();
      }
    }, 15000);
  });
}

/**
 * Executes evaluation logic when a candidate finishes speaking or typing an answer.
 * Persists results to database, sends metrics to client, and queues the next question.
 * 
 * @param {Object} state - Isolated connection state object
 * @param {WebSocket} ws - Client WebSocket instance
 */
async function handleAnswerComplete(state, ws) {
  const answerText = state.currentTranscript.trim();
  if (!answerText || !state.currentQuestionId) return;
  state.currentTranscript = ""; // Reset for next question cycle

  try {
    // Generate AI evaluation report on this specific answer using LLM
    const evaluation = await evaluateAnswer(
      state.currentQuestion,
      answerText,
      state.currentTopic,
      state.targetRole
    );

    // Save answer content and evaluation scores into Database
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

    // Append current exchange to the ongoing conversation context
    state.conversationHistory.push(
      { role: "assistant", content: state.currentQuestion },
      { role: "user", content: answerText }
    );

    // Send scoring metrics back to client UI
    send(ws, MSG.EVALUATION, {
      questionId: state.currentQuestionId,
      score: evaluation.score,
      feedback: evaluation.feedback,
      fillerWords: evaluation.fillerWords,
      wpm: evaluation.estimatedWpm,
    });
  } catch (err) {
    console.error("[WS] Answer evaluation failed:", err);
    send(ws, MSG.ERROR, { message: "Failed to evaluate answer: " + (err.message || String(err)) });
    // Restore transcript state to allow candidate to retry/resubmit
    state.currentTranscript = answerText;
    return;
  }

  // Monitor question threshold limits (each interview has a hard cap of 12 questions)
  state.questionNumber++;
  if (state.questionNumber >= 12) {
    send(ws, MSG.SESSION_END, { message: "Interview complete. Generating your report..." });
    return;
  }

  // Wait 1.5 seconds to give candidate time to read feedback before sending next question
  setTimeout(() => generateAndSendQuestion(state, ws), 1500);
}

/**
 * Triggers LLM completion to construct the next technical question.
 * Uses resume details and conversation history to construct context.
 * 
 * @param {Object} state - Isolated connection state object
 * @param {WebSocket} ws - Client WebSocket instance
 */
async function generateAndSendQuestion(state, ws) {
  try {
    let result;
    // Question 0 triggers the ice-breaker resume-based intro question
    if (state.questionNumber === 0) {
      result = await generateFirstQuestion({
        targetRole: state.targetRole,
        resumeJson: state.resumeJson,
        userName: state.userName,
      });
    } else {
      // Subsequent questions evaluate responses and adapt topics contextually
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

    // Create database entry for the newly generated question
    const qResult = await query(
      `INSERT INTO session_questions (session_id, sequence_num, topic, question_text)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [state.sessionId, state.questionNumber + 1, result.topic, result.question]
    );
    state.currentQuestionId = qResult.rows[0].id;

    // Dispatch question payload to the client
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

/**
 * Configures WebSocket endpoints, routing messages and maintaining connections.
 * 
 * @param {http.Server} server - HTTP Server instance
 * @returns {WebSocket.Server} Configured WebSocket server instance
 */
function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    console.log(`[WS] New connection from ${req.socket.remoteAddress}`);
    const state = createSessionState();

    // Reset ping flag on successful heartbeat handshake
    ws.isAlive = true;
    ws.on("pong", () => { ws.isAlive = true; });

    ws.on("message", async (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) { return; }

      switch (msg.type) {
        // Authenticate new connections
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

        // Initialize interview parameters and start transcription
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
              await connectAssemblyAI(state, ws);
              await generateAndSendQuestion(state, ws);
            } catch (err) {
              console.error("[WS] START failed:", err);
              send(ws, MSG.ERROR, { message: err.message || "Failed to start interview" });
            }
          })();
          break;
        }

        // Relays raw audio stream chunks to the AssemblyAI WebSocket
        case MSG.AUDIO_CHUNK: {
          if (state.deepgramWs?.readyState === WebSocket.OPEN && msg.data) {
            const buf = Buffer.from(msg.data, "base64");
            state.deepgramWs.send(buf);
          }
          break;
        }

        // Handles manual input submission if microphone fails
        case MSG.TEXT_ANSWER: {
          if (!state.sessionId || !msg.text) return;
          state.currentTranscript = msg.text;
          try {
            await handleAnswerComplete(state, ws);
          } catch(e) {
            console.error("[WS] Answer hander failed:", e);
            send(ws, MSG.ERROR, { message: "System error while processing answer." });
          }
          break;
        }

        // Logs facial expression analysis frame records in DB
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

        // Respond to heartbeat check
        case MSG.PING:
          send(ws, MSG.PONG, {});
          break;
      }
    });

    // Cleanup resources on socket termination
    ws.on("close", () => {
      if (state.deepgramWs) state.deepgramWs.close();
      console.log(`[WS] Connection closed for user ${state.userId}`);
    });

    ws.on("error", (err) => console.error("[WS] Error:", err.message));
  });

  // Schedule regular heartbeat ping checks to clean up orphaned/dead sockets
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
