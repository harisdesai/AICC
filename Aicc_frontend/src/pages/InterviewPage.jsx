import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import api from "../lib/api";
import { useInterviewSocket } from "../hooks/useInterviewSocket";
import { useMicrophone } from "../hooks/useMicrophone";
import { useEmotionDetection } from "../hooks/useEmotionDetection";
import { useTTS } from "../hooks/useTTS";
import { useSpeechRecognition } from "../hooks/useSpeechRecognition";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { Button, Card, Tag, Spinner } from "../components/ui";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";

/**
 * Interactive React Workspace Component for Live Interviews.
 * 
 * Sets up camera feed, real-time voice capturing (ElevenLabs Scribe STT), AI voice synthesis (Indian Accent TTS),
 * live facial expressions metrics tracking, difficulty levels (Easy, Medium, Hard), and question-answer sequences.
 */
export default function InterviewPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const videoRef = useRef(null);

  // Core loading and session states
  const [loading, setLoading] = useState(true);
  const [sessionPayload, setSessionPayload] = useState(null);
  const [mediaStream, setMediaStream] = useState(null);
  const [question, setQuestion] = useState(null);
  const [partial, setPartial] = useState("");
  const [evaluations, setEvaluations] = useState([]);
  const [err, setErr] = useState("");
  const startedRef = useRef(false);
  const [wsReady, setWsReady] = useState(false);
  const [features, setFeatures] = useState(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [interviewStarted, setInterviewStarted] = useState(false);
  
  // UI metrics tracking states
  const [latestEmotion, setLatestEmotion] = useState({ neutral: 1, happy: 0, sad: 0, fearful: 0, surprised: 0, disgusted: 0, angry: 0 });
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Text-To-Speech (AI Interviewer Voice - Default Indian Accent) Hook
  const {
    speak,
    stop: stopTTS,
    repeatLast,
    toggleMute: toggleMuteTTS,
    isSpeaking,
    isMuted: ttsMuted,
    accent,
    setAccent,
    availableAccents,
  } = useTTS();

  // ElevenLabs Audio Recorder & STT Hook
  const { recording: isRecordingAudio, transcribing: isTranscribingAudio, startRecording, stopRecording } = useAudioRecorder();

  // Browser Native Speech-To-Text (Interim Preview) Hook
  const {
    transcript: sttTranscript,
    interimTranscript,
    fullTranscript,
    listening: sttListening,
    startListening: startSTT,
    stopListening: stopSTT,
    resetTranscript,
  } = useSpeechRecognition({
    onTranscriptChange: (text) => {
      if (text) {
        setTextAnswer(text);
      }
    },
  });

  /**
   * Dispatches spoken or typed answer to the active websocket for evaluation.
   */
  const handleAnswerSubmit = async () => {
    stopSTT();
    stopTTS();
    stopMic();

    let elText = "";
    if (isRecordingAudio) {
      elText = await stopRecording();
    }

    const finalAns = textAnswer.trim() || elText.trim() || fullTranscript.trim() || partial.trim();
    if (!finalAns) return;

    sendRef.current("text_answer", { text: finalAns });
    setTextAnswer("");
    resetTranscript();
    setPartial("");
  };

  /**
   * Toggles active voice recording / ElevenLabs speech recognition session.
   */
  const handleMicToggle = async () => {
    if (sttListening || isRecordingAudio || micActive) {
      stopSTT();
      stopMic();
      const elText = await stopRecording();
      if (elText) {
        setTextAnswer((prev) => (prev ? `${prev} ${elText}` : elText));
      }
    } else {
      stopTTS(); // Stop AI voice when candidate speaks
      resetTranscript();
      startSTT();
      startMic();
      if (mediaStream) {
        startRecording(mediaStream);
      }
    }
  };

  // Fetch session parameters on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get(`/sessions/${sessionId}`);
        if (!cancelled) setSessionPayload(data);
      } catch (e) {
        if (!cancelled) setErr(e.response?.data?.error || "Could not load session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  // Load app wide system flags/features configuration
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get("/health/features");
        if (!cancelled) setFeatures(data);
      } catch {
        if (!cancelled) setFeatures(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Timer interval updating interview session duration
  useEffect(() => {
    if (!interviewStarted) return;
    const interval = setInterval(() => {
      setTimerSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [interviewStarted]);

  /**
   * Formats total seconds into MM:SS format.
   * 
   * @param {number} s - Time in seconds
   * @returns {string} Formatted string
   */
  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Media Capture Initialization: requests mic/cam permissions from user
  useEffect(() => {
    if (!sessionPayload || !interviewStarted) return undefined;
    let stream;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
        setMediaStream(stream);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        setErr(e.message || "Camera/mic permission denied");
      }
    })();
    return () => {
      stream?.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    };
  }, [sessionPayload, interviewStarted]);

  const sendAudioRef = useRef(() => {});

  /**
   * Listens to and acts on server websocket events.
   */
  const onMessage = useCallback((msg) => {
    // Auth success: start the interview loop
    if (msg.type === "auth_ok" && sessionPayload && !startedRef.current) {
      startedRef.current = true;
      sendRef.current("start_session", {
        sessionId,
        targetRole: sessionPayload.session.target_role,
        difficulty: sessionPayload.session.difficulty || "medium",
        resumeJson: sessionPayload.resume?.raw_json || {},
      });
      setWsReady(true);
      return;
    }
    if (msg.type === "auth_error") {
      setErr(msg.message || "Auth failed");
      return;
    }
    // New question received: update DOM question display and read out loud via TTS
    if (msg.type === "question") {
      setQuestion(msg);
      setPartial("");
      setTextAnswer("");
      resetTranscript();

      // Read question out loud with greeting on Question #1
      const userName = user?.name || sessionPayload?.resume?.raw_json?.name || "Candidate";
      const targetRole = sessionPayload?.session?.target_role || "Engineering";
      const difficulty = (sessionPayload?.session?.difficulty || "medium").toUpperCase();
      
      let ttsMessage = "";
      if (msg.questionNumber === 1) {
        ttsMessage = `Hello ${userName}, welcome to your ${difficulty} level interview for the ${targetRole} position. Let's get started with your first question: ${msg.text}`;
      } else {
        ttsMessage = `Question ${msg.questionNumber}: ${msg.text}`;
      }
      speak(ttsMessage);
      return;
    }
    // Partial real-time voice transcription
    if (msg.type === "transcript_partial") {
      setPartial(msg.text || "");
      if (msg.text) setTextAnswer(msg.text);
      return;
    }
    // Final transcription block completed
    if (msg.type === "transcript_final") {
      setPartial("");
      if (msg.text) setTextAnswer((prev) => prev ? `${prev} ${msg.text}` : msg.text);
      return;
    }
    // Intermediate question answer grading
    if (msg.type === "evaluation") {
      setEvaluations((prev) => [...prev, msg]);
      return;
    }
    // Interview ended: trigger server analytics report and navigate
    if (msg.type === "session_end") {
      (async () => {
        try {
          await api.post(`/sessions/${sessionId}/finalize`);
        } catch (_) { /* ignore */ }
        navigate(`/report/${sessionId}`);
      })();
      return;
    }
    if (msg.type === "error") {
      setErr(msg.message || "Server error");
    }
  }, [sessionPayload, sessionId, navigate, speak, resetTranscript, user]);

  const sendRef = useRef(() => {});
  // Initialize interview websocket connector
  const { connect, send, sendAudio, disconnect } = useInterviewSocket({ onMessage, token });
  sendRef.current = send;
  sendAudioRef.current = sendAudio;

  // Initialize microphone device streaming wrapper
  const { start: startMic, stop: stopMic, active: micActive, error: micError } = useMicrophone({
    mediaStream,
    onAudioChunk: useCallback((buf) => sendAudioRef.current(buf), []),
  });

  // Socket connection trigger
  useEffect(() => {
    if (token && !loading && sessionPayload && interviewStarted) connect();
    return () => disconnect();
  }, [token, loading, sessionPayload, interviewStarted, connect, disconnect]);

  const emotionSendRef = useRef(() => {});
  // Maps face expression predictions and dispatches to server
  emotionSendRef.current = (emotion) => {
    const s = emotion.scores || {};
    setLatestEmotion({
      happy: s.happy ?? 0,
      sad: s.sad ?? 0,
      angry: s.angry ?? 0,
      fearful: s.fearful ?? 0,
      surprised: s.surprised ?? 0,
      disgusted: s.disgusted ?? 0,
      neutral: s.neutral ?? 0,
    });
    send("emotion_snapshot", {
      happy: s.happy ?? 0,
      sad: s.sad ?? 0,
      angry: s.angry ?? 0,
      fearful: s.fearful ?? 0,
      surprised: s.surprised ?? 0,
      disgusted: s.disgusted ?? 0,
      neutral: s.neutral ?? 0,
    });
  };

  // Initialize face-api emotion classifications
  const { ready: faceReady, start: startFace, stop: stopFace } = useEmotionDetection({
    videoRef,
    onEmotion: (e) => emotionSendRef.current(e),
    intervalMs: 500,
  });

  // Start polling face expressions when camera is ready
  useEffect(() => {
    if (mediaStream && faceReady && interviewStarted) startFace();
    return () => stopFace();
  }, [mediaStream, faceReady, startFace, stopFace, interviewStarted]);

  /**
   * Concludes the interview manually.
   */
  const endSession = async () => {
    stopSTT();
    stopTTS();
    stopRecording();
    stopMic();
    disconnect();
    try {
      if (startedRef.current) await api.post(`/sessions/${sessionId}/finalize`);
    } catch (_) { }
    navigate(`/report/${sessionId}`);
  };

  /**
   * Iterates emotion state scores to isolate the highest classification weight.
   * 
   * @returns {Object} Target classification parameter
   */
  const getDominantEmotion = () => {
    const highest = Object.keys(latestEmotion).reduce((a, b) => latestEmotion[a] > latestEmotion[b] ? a : b);
    return { name: highest, value: latestEmotion[highest] };
  };
  const domE = getDominantEmotion();

  // Speaking pace trace array
  const wpmData = [
    { name: 'Q1', value: 128 }, { name: 'Q2', value: 145 }, { name: 'Q3', value: 142 },
    { name: 'Q4', value: 160 }, { name: 'Q5', value: 138 }, { name: 'Q6', value: 142 },
  ];

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <Spinner />
      </div>
    );
  }

  if (err && !sessionPayload) {
    return (
      <div style={{ padding: 48, color: "var(--red)" }}>
        {err}
        <Button variant="ghost" style={{ marginTop: 16 }} onClick={() => navigate("/dashboard")}>Back</Button>
      </div>
    );
  }

  // Centered setup view displayed if interview has NOT started
  if (!interviewStarted) {
    const diff = sessionPayload?.session?.difficulty || "medium";
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Card style={{ padding: 48, maxWidth: 520, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 26, fontWeight: 600, marginBottom: 12, fontFamily: "DM Serif Display, serif" }}>Ready for your AI Interview?</div>
          <div style={{ marginBottom: 16 }}>
            <Tag variant={diff === "easy" ? "green" : diff === "hard" ? "amber" : "accent"}>
              {diff.toUpperCase()} DIFFICULTY
            </Tag>
          </div>
          <p style={{ color: "var(--text2)", marginBottom: 24, lineHeight: 1.6 }}>
            Click below to initialize your camera and microphone. The AI Interviewer will greet you with an Indian Accent, read technical questions, and transcribe your spoken responses via ElevenLabs Scribe.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 32, fontSize: 13, color: "var(--text3)" }}>
            <span>🇮🇳 Indian Accent TTS</span> · <span>🎙️ ElevenLabs Scribe STT</span>
          </div>
          <Button size="lg" onClick={() => { setInterviewStarted(true); setTimeout(handleMicToggle, 500); }} style={{ width: "100%" }}>
            Start Interview Session
          </Button>
          <Button variant="ghost" style={{ marginTop: 16, width: "100%" }} onClick={() => navigate("/dashboard")}>Cancel</Button>
        </Card>
      </div>
    );
  }

  const isListeningActive = isRecordingAudio || sttListening || micActive;
  const currentDiff = sessionPayload?.session?.difficulty || "medium";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      {/* Top Nav */}
      <nav style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", height: 65 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 18 }}>
            AI<span style={{ color: "var(--accent)" }}>CC</span> — <span style={{ fontSize: 14, color: "var(--text2)", fontFamily: "Outfit, sans-serif", fontWeight: 400 }}>{sessionPayload?.session?.target_role || "Interview Session"}</span>
          </div>
          <Tag variant={currentDiff === "easy" ? "green" : currentDiff === "hard" ? "amber" : "accent"}>
            {currentDiff.toUpperCase()}
          </Tag>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {isSpeaking && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, background: "var(--accent-dim)", color: "var(--accent2)", padding: "4px 10px", borderRadius: 20 }}>
              <span className="pulse">🔊</span> AI Interviewer Speaking...
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--green)" }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", animation: "pulse 2s infinite" }}></div> Live
          </div>
          <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 20, color: "var(--accent2)", fontWeight: 500 }}>
            {formatTimer(timerSeconds)}
          </div>
          <Button variant="danger" size="sm" onClick={endSession} style={{ padding: "6px 14px", fontSize: 13 }}>End Session</Button>
        </div>
      </nav>

      {err && <div style={{ background: "var(--red-dim)", color: "var(--red)", padding: "8px 24px", fontSize: 13 }}>{err}</div>}
      {micError && <div style={{ background: "var(--red-dim)", color: "var(--red)", padding: "8px 24px", fontSize: 13 }}>Mic Error: {micError}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", flex: 1, gap: 0, overflow: "hidden" }}>
        {/* Main Column */}
        <div style={{ display: "flex", flexDirection: "column", padding: "32px 48px", gap: 24, overflowY: "auto", position: "relative" }}>
          
          <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
            {/* Video Box */}
            <div style={{ width: 280, height: 200, borderRadius: "var(--radius)", background: "var(--bg3)", border: "1px solid var(--border)", position: "relative", overflow: "hidden", flexShrink: 0 }}>
              <video
                ref={videoRef}
                muted
                playsInline
                autoPlay
                style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scaleX(-1)", backgroundColor: "#000" }}
              />
              <div style={{ position: "absolute", bottom: 10, left: 10, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(8px)", border: "1px solid var(--border2)", borderRadius: 20, padding: "4px 10px", fontSize: 11, color: "var(--green)", display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--red)", animation: "pulse 1.5s infinite" }}></div>
                <span style={{ textTransform: "capitalize" }}>{domE.name}</span> · {Math.round(domE.value * 100)}%
              </div>
            </div>

            {/* Audio Waveform & Speech Status Panel */}
            <div style={{ flex: 1, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: 8 }}>
                  <span>ElevenLabs Scribe STT</span>
                  {isListeningActive && <Tag variant="green">Recording Live</Tag>}
                  {isTranscribingAudio && <Tag variant="amber">Transcribing Audio...</Tag>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>Pace: <span style={{ color: "var(--text)" }}>Normal</span></div>
              </div>
              <div className="waveform">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.04}s`, height: `${Math.max(8, Math.random() * (isListeningActive ? 40 : 8))}px` }}></div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, background: "var(--bg4)", borderRadius: "var(--radius-sm)", padding: 12, flex: 1, fontStyle: "italic", overflowY: "auto", maxHeight: 80 }}>
                {isTranscribingAudio ? (
                  <span style={{ color: "var(--amber)", fontStyle: "normal", display: "flex", alignItems: "center", gap: 8 }}>
                    <Spinner size={14} /> Transcribing speech with ElevenLabs Scribe STT...
                  </span>
                ) : isListeningActive ? (
                  textAnswer || interimTranscript ? `"${textAnswer || interimTranscript}..."` : "Listening... Speak your answer now."
                ) : (
                  "Microphone paused. Click 'Speak Answer' below or type your response."
                )}
              </div>
            </div>
          </div>

          {/* Chat Interface */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, overflowY: "auto", paddingBottom: 20 }}>
            {evaluations.map((ev, i) => (
              <div key={i} className="msg ai">
                <div className="msg-avatar">🤖</div>
                <div>
                  <div className="msg-bubble">
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>Score: {ev.score}/100</span>{" "}—{" "}{ev.feedback}
                  </div>
                </div>
              </div>
            ))}
            
            {question && (
              <div className="msg ai appear">
                <div className="msg-avatar">🤖</div>
                <div style={{ width: "100%" }}>
                  <div className="msg-bubble" style={{ position: "relative", paddingRight: 40 }}>
                    {question.text}
                    {isSpeaking && (
                      <span style={{ marginLeft: 10, fontSize: 12, color: "var(--accent)" }} className="pulse">
                        🔊 Speaking...
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, fontSize: 11, color: "var(--text3)" }}>
                    <span>Topic: {question.topic}</span>
                    <span>·</span>
                    <button
                      onClick={repeatLast}
                      style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}
                    >
                      🔊 Replay Question
                    </button>
                    <span>·</span>
                    <button
                      onClick={toggleMuteTTS}
                      style={{ background: "none", border: "none", color: ttsMuted ? "var(--amber)" : "var(--text3)", cursor: "pointer", fontSize: 11, padding: 0 }}
                    >
                      {ttsMuted ? "🔇 Voice Muted" : "🔈 Mute AI Voice"}
                    </button>
                    <span>·</span>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span>Accent:</span>
                      <select
                        value={accent}
                        onChange={(e) => setAccent(e.target.value)}
                        style={{ background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 12, padding: "2px 6px", fontSize: 11, outline: "none", cursor: "pointer" }}
                      >
                        {availableAccents.map((acc) => (
                          <option key={acc.id} value={acc.id}>{acc.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            {(textAnswer || interimTranscript || partial) && (
              <div className="msg user appear">
                <div className="msg-avatar" style={{ fontSize: 12 }}>You</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '100%' }}>
                  <div className="msg-bubble" style={{ background: "var(--accent-dim)", border: "1px solid var(--accent)" }}>
                    {textAnswer || interimTranscript || partial}
                  </div>
                  <span style={{ fontSize: 10, color: "var(--text3)", marginTop: 4 }}>Drafting answer...</span>
                </div>
              </div>
            )}
            
            {!question && (
              <div className="msg ai appear">
                <div className="msg-avatar">🤖</div>
                <div>
                  <div className="msg-bubble" style={{ color: "var(--text3)", fontStyle: "italic" }}>
                    <Spinner size={14} /> Generating context and preparing question...
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flexShrink: 0, padding: 16, background: "var(--bg2)", borderTop: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <button 
                onClick={handleMicToggle}
                disabled={!mediaStream || isTranscribingAudio}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  background: isListeningActive ? "var(--red-dim)" : "var(--bg3)",
                  border: "1px solid",
                  borderColor: isListeningActive ? "var(--red)" : "var(--border2)",
                  color: isListeningActive ? "var(--red)" : "var(--text)",
                  borderRadius: 40,
                  padding: "10px 20px",
                  fontSize: 14,
                  cursor: "pointer",
                  fontFamily: "Outfit, sans-serif",
                  transition: "all 0.2s",
                  fontWeight: 500,
                }}
              >
                <span>{isListeningActive ? "🔴" : "🎙️"}</span>
                {isListeningActive ? "Stop & Transcribe" : "Speak Answer"}
              </button>

              <div style={{ flex: 1, display: "flex", gap: 10 }}>
                <input 
                  type="text" 
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAnswerSubmit(); }}
                  placeholder="Speak or type your answer here..." 
                  style={{ flex: 1, padding: "10px 16px", borderRadius: 40, border: "1px solid var(--border)", background: "var(--bg3)", color: "var(--text)", fontSize: 14, outline: "none" }} 
                />
              </div>

              <Button
                onClick={handleAnswerSubmit}
                disabled={(!textAnswer.trim() && !fullTranscript.trim() && !partial.trim() && !isRecordingAudio) || isTranscribingAudio}
                style={{ borderRadius: 40, padding: "10px 24px" }}
              >
                {isTranscribingAudio ? <Spinner size={14} /> : "Submit Answer →"}
              </Button>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "var(--text3)", paddingLeft: 8, paddingRight: 8 }}>
              <span>ElevenLabs Scribe STT powered voice recognition. Speak your response or type into the box.</span>
              <span>Question {question ? question.questionNumber : "?"} of {question ? (question.totalQuestions || 12) : 12}</span>
            </div>
          </div>

        </div>

        {/* Sidebar */}
        <div style={{ borderLeft: "1px solid var(--border)", background: "var(--bg2)", display: "flex", flexDirection: "column", overflowY: "auto" }}>
          
          <div style={{ padding: 24, borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>Emotion Analysis</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(latestEmotion).filter(([k]) => ['neutral','happy','fearful','surprised'].includes(k)).map(([key, val]) => (
                <div key={key} style={{ background: "var(--bg3)", borderRadius: "var(--radius-sm)", padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12, color: "var(--text2)", display: "flex", justifyContent: "space-between", textTransform: "capitalize" }}>
                    <span>{key}</span>
                    <span style={{ color: key === 'happy' ? 'var(--green)' : key === 'fearful' ? 'var(--amber)' : 'var(--text)' }}>
                      {Math.round(val * 100)}%
                    </span>
                  </div>
                  <div style={{ height: 4, background: "var(--bg4)", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ width: `${Math.round(val * 100)}%`, height: "100%", borderRadius: 2, transition: "width 0.5s ease", background: key === 'happy' ? 'var(--green)' : key === 'fearful' ? 'var(--amber)' : 'var(--accent)' }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ padding: 24, borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>Filler Words</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <div className="tag amber"><span>um</span><span style={{ fontWeight: 600, marginLeft: 6 }}>×2</span></div>
              <div className="tag amber"><span>like</span><span style={{ fontWeight: 600, marginLeft: 6 }}>×1</span></div>
            </div>
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text3)" }}>Target: &lt;3 per minute · Current: 1.5/min</div>
          </div>

          <div style={{ padding: 24, borderBottom: "1px solid var(--border)" }}>
            <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>Topic Progress</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {question ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, background: "var(--accent-dim)", color: "var(--accent2)" }}>→</div>
                  <span>{question.topic}</span>
                </div>
              ) : (
                <span style={{ fontSize: 13, color: "var(--text2)" }}>Preparing topics...</span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13 }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, background: "var(--bg4)", color: "var(--text3)" }}>○</div>
                <span style={{ color: "var(--text3)" }}>Upcoming Topic</span>
              </div>
            </div>
          </div>

          <div style={{ padding: 24 }}>
            <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 16 }}>Speaking Pace (WPM)</div>
            <div style={{ height: 100, width: "100%", marginLeft: -20 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={wpmData}>
                  <XAxis dataKey="name" hide />
                  <YAxis domain={[100, 180]} hide />
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
              <span>Ideal: 120–160 WPM</span><span>Now: ~142 WPM</span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
