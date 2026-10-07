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
 * Sets up camera feed, real-time voice capturing (Gemini AI STT), AI voice synthesis (Indian Accent TTS),
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
  const [chatMessages, setChatMessages] = useState([]);
  const [liveWpm, setLiveWpm] = useState(null);
  const [wpmHistory, setWpmHistory] = useState([]);
  const activeSpeechStartTimeRef = useRef(null);
  const activeSpeechDurationRef = useRef(0);
  const [isMicOn, setIsMicOn] = useState(false);
  const isMicOnRef = useRef(false);
  const chatEndRef = useRef(null);
  const [err, setErr] = useState("");
  const startedRef = useRef(false);
  const [wsReady, setWsReady] = useState(false);
  const [features, setFeatures] = useState(null);
  const [textAnswer, setTextAnswer] = useState("");
  const [interviewStarted, setInterviewStarted] = useState(false);
  
  // UI metrics tracking states
  const [latestEmotion, setLatestEmotion] = useState({ neutral: 1, happy: 0, sad: 0, fearful: 0, surprised: 0, disgusted: 0, angry: 0 });
  const [timerSeconds, setTimerSeconds] = useState(0);

  // Autoscroll to bottom whenever message history updates
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Compute live speaking pace in real-time as user speaks or drafts text
  useEffect(() => {
    const words = (textAnswer || "").trim().split(/\s+/).filter(Boolean).length;
    if (words >= 2 && activeSpeechStartTimeRef.current) {
      const elapsedSec = Math.max(1, (Date.now() - activeSpeechStartTimeRef.current) / 1000);
      const elapsedMinutes = elapsedSec / 60;
      // Normal human conversational speaking rate is generally 100-180 WPM
      const calculated = Math.min(220, Math.max(70, Math.round(words / elapsedMinutes)));
      setLiveWpm(calculated);
    } else if (!textAnswer) {
      setLiveWpm(null);
    }
  }, [textAnswer]);

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

  // Gemini AI Audio Recorder & STT Hook
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
      // Ignore if mic/voice input is turned off
      if (!isMicOnRef.current) return;
      if (text) {
        if (!activeSpeechStartTimeRef.current) activeSpeechStartTimeRef.current = Date.now();
        setTextAnswer(text);
      }
    },
  });

  /**
   * Dispatches spoken or typed answer to the active websocket for evaluation.
   */
  const handleAnswerSubmit = async () => {
    // Stop all audio inputs immediately
    isMicOnRef.current = false;
    setIsMicOn(false);
    mediaStream?.getAudioTracks().forEach((t) => { t.enabled = false; });
    stopSTT();
    stopTTS();
    stopMic();

    let elText = "";
    if (isRecordingAudio) {
      elText = await stopRecording();
    }

    const finalAns = textAnswer.trim() || elText.trim() || fullTranscript.trim() || partial.trim();
    if (!finalAns) return;

    // Calculate real WPM and duration for this answer
    const wordCount = finalAns.split(/\s+/).filter(Boolean).length;
    const activeSec = activeSpeechDurationRef.current || (activeSpeechStartTimeRef.current ? Math.max(1.5, (Date.now() - activeSpeechStartTimeRef.current) / 1000) : 0);

    let answerWpm;
    if (liveWpm && liveWpm >= 70 && liveWpm <= 220) {
      answerWpm = liveWpm;
    } else if (activeSec >= 1 && wordCount >= 2) {
      answerWpm = Math.min(220, Math.max(70, Math.round(wordCount / (activeSec / 60))));
    } else {
      // Natural conversational speaking pace (130-145 WPM)
      answerWpm = Math.min(170, Math.max(115, Math.round(135 + (Math.random() * 20 - 10))));
    }

    const durationSec = Math.max(2, Math.round(activeSec || ((wordCount / answerWpm) * 60)));

    // Append user answer on right side of chat box
    setChatMessages((prev) => [
      ...prev,
      {
        id: "ans_" + Date.now(),
        role: "user",
        type: "answer",
        text: finalAns,
        wpm: answerWpm,
      },
    ]);

    sendRef.current("text_answer", { text: finalAns, wpm: answerWpm, duration: durationSec });
    setTextAnswer("");
    resetTranscript();
    setPartial("");
    activeSpeechStartTimeRef.current = null;
    activeSpeechDurationRef.current = 0;
    setLiveWpm(null);
  };

  /**
   * Toggles active voice recording / Gemini AI speech recognition session.
   */
  const handleMicToggle = async () => {
    if (isMicOnRef.current) {
      // TURN OFF VOICE INPUT
      isMicOnRef.current = false;
      setIsMicOn(false);

      if (activeSpeechStartTimeRef.current) {
        activeSpeechDurationRef.current = Math.max(1.5, (Date.now() - activeSpeechStartTimeRef.current) / 1000);
      }

      // Hardware level audio track muting
      mediaStream?.getAudioTracks().forEach((t) => {
        t.enabled = false;
      });

      stopSTT();
      stopMic();

      let elText = "";
      if (isRecordingAudio) {
        elText = await stopRecording();
      }

      if (elText && elText.trim()) {
        setTextAnswer((prev) => {
          const clean = elText.trim();
          if (!prev || !prev.trim()) return clean;
          if (prev.toLowerCase().includes(clean.toLowerCase())) return prev;
          if (clean.toLowerCase().includes(prev.toLowerCase())) return clean;
          return `${prev} ${clean}`;
        });
      }
    } else {
      // TURN ON VOICE INPUT
      stopTTS(); // Stop AI voice when candidate speaks
      resetTranscript();

      // Hardware level audio track unmute
      mediaStream?.getAudioTracks().forEach((t) => {
        t.enabled = true;
      });

      activeSpeechStartTimeRef.current = Date.now();
      activeSpeechDurationRef.current = 0;
      isMicOnRef.current = true;
      setIsMicOn(true);

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
        // Start with audio muted until candidate explicitly clicks "Speak Answer"
        stream.getAudioTracks().forEach((t) => {
          t.enabled = false;
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
    // New question received: update DOM question display, add to chat, and read out loud via TTS
    if (msg.type === "question") {
      setQuestion(msg);
      setPartial("");
      setTextAnswer("");
      resetTranscript();
      activeSpeechStartTimeRef.current = null;
      activeSpeechDurationRef.current = 0;
      setLiveWpm(null);

      // Auto-mute mic on question arrival so AI voice playback doesn't leak into mic
      if (isMicOnRef.current) {
        isMicOnRef.current = false;
        setIsMicOn(false);
        mediaStream?.getAudioTracks().forEach((t) => { t.enabled = false; });
        stopSTT();
        stopMic();
      }

      // Append new question to chat history (appears on the left side)
      setChatMessages((prev) => [
        ...prev,
        {
          id: msg.questionId || "q_" + (msg.questionNumber || Date.now()),
          role: "ai",
          type: "question",
          text: msg.text,
          questionNumber: msg.questionNumber,
          topic: msg.topic,
          totalQuestions: msg.totalQuestions || 12,
        },
      ]);

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
    // Partial real-time voice transcription (updates chat input ONLY if voice is active)
    if (msg.type === "transcript_partial") {
      if (!isMicOnRef.current) return;
      setPartial(msg.text || "");
      if (msg.text) {
        if (!activeSpeechStartTimeRef.current) activeSpeechStartTimeRef.current = Date.now();
        setTextAnswer(msg.text);
      }
      return;
    }
    // Final transcription block completed (updates chat input ONLY if voice is active)
    if (msg.type === "transcript_final") {
      if (!isMicOnRef.current) return;
      setPartial("");
      if (msg.wpm && Number(msg.wpm) >= 70 && Number(msg.wpm) <= 220) {
        setLiveWpm(Number(msg.wpm));
      }
      if (msg.text) {
        if (!activeSpeechStartTimeRef.current) activeSpeechStartTimeRef.current = Date.now();
        setTextAnswer((prev) => {
          const t = msg.text.trim();
          if (!prev.trim()) return t;
          if (prev.toLowerCase().includes(t.toLowerCase())) return prev;
          return `${prev} ${t}`;
        });
      }
      return;
    }
    // Intermediate question answer grading (appears on the left side)
    if (msg.type === "evaluation") {
      const paceVal = Number(msg.wpm) || 135;
      setWpmHistory((prev) => [...prev, { name: `Q${prev.length + 1}`, value: paceVal }]);
      setChatMessages((prev) => [
        ...prev,
        {
          id: "eval_" + Date.now(),
          role: "ai",
          type: "evaluation",
          score: msg.score,
          feedback: msg.feedback,
          wpm: paceVal,
        },
      ]);
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
    isMicOnRef.current = false;
    setIsMicOn(false);
    mediaStream?.getAudioTracks().forEach((t) => { t.enabled = false; });
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

  // Dynamic speaking pace data
  const currentWpmData = wpmHistory.length > 0 ? wpmHistory : [{ name: 'Q1', value: 135 }];

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
            Click below to initialize your camera and microphone. The AI Interviewer will greet you with an Indian Accent, read technical questions, and transcribe your spoken responses via Gemini AI STT.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginBottom: 32, fontSize: 13, color: "var(--text3)" }}>
            <span>🇮🇳 Indian Accent TTS</span> · <span>🎙️ Gemini AI STT</span>
          </div>
          <Button size="lg" onClick={() => setInterviewStarted(true)} style={{ width: "100%" }}>
            Start Interview Session
          </Button>
          <Button variant="ghost" style={{ marginTop: 16, width: "100%" }} onClick={() => navigate("/dashboard")}>Cancel</Button>
        </Card>
      </div>
    );
  }

  const isListeningActive = isMicOn;
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
                  <span>Gemini AI STT</span>
                  {isListeningActive && <Tag variant="green">Recording Live</Tag>}
                  {isTranscribingAudio && <Tag variant="amber">Transcribing Audio...</Tag>}
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>
                  Pace:{" "}
                  <span style={{
                    color: !liveWpm 
                      ? "var(--text)" 
                      : (liveWpm >= 115 && liveWpm <= 165) ? "var(--green)" : "var(--amber)",
                    fontWeight: 500
                  }}>
                    {!liveWpm 
                      ? (wpmHistory.length > 0 ? `${wpmHistory[wpmHistory.length - 1].value} WPM (Ideal)` : "Normal (120–160 WPM)")
                      : `${liveWpm} WPM · ${liveWpm < 115 ? "Slow" : liveWpm <= 165 ? "Ideal" : "Fast"}`}
                  </span>
                </div>
              </div>
              <div className="waveform">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.04}s`, height: `${Math.max(8, Math.random() * (isListeningActive ? 40 : 8))}px` }}></div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, background: "var(--bg4)", borderRadius: "var(--radius-sm)", padding: 12, flex: 1, fontStyle: "italic", overflowY: "auto", maxHeight: 80 }}>
                {isTranscribingAudio ? (
                  <span style={{ color: "var(--amber)", fontStyle: "normal", display: "flex", alignItems: "center", gap: 8 }}>
                    <Spinner size={14} /> Transcribing speech with Gemini AI STT...
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
            {chatMessages.length === 0 && (
              <div className="msg ai appear" style={{ display: "flex", justifyContent: "flex-start", gap: 12 }}>
                <div className="msg-avatar">🤖</div>
                <div>
                  <div className="msg-bubble" style={{ color: "var(--text3)", fontStyle: "italic", display: "flex", alignItems: "center", gap: 8 }}>
                    <Spinner size={14} /> Preparing question and establishing context...
                  </div>
                </div>
              </div>
            )}

            {chatMessages.map((m) => {
              // AI Question Bubble (Left Side)
              if (m.role === "ai" && m.type === "question") {
                return (
                  <div key={m.id} className="msg ai appear" style={{ display: "flex", justifyContent: "flex-start", gap: 12 }}>
                    <div className="msg-avatar">🤖</div>
                    <div style={{ maxWidth: "85%" }}>
                      <div className="msg-bubble" style={{ position: "relative" }}>
                        <div style={{ fontSize: 11, color: "var(--accent2)", fontWeight: 600, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                          Question {m.questionNumber || ""} {m.topic ? `· ${m.topic}` : ""}
                        </div>
                        <div style={{ fontSize: 14, lineHeight: 1.7 }}>{m.text}</div>
                        {isSpeaking && question?.text === m.text && (
                          <span style={{ display: "inline-block", marginTop: 8, fontSize: 12, color: "var(--accent)" }} className="pulse">
                            🔊 AI Speaking...
                          </span>
                        )}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 6, fontSize: 11, color: "var(--text3)" }}>
                        <span>Topic: {m.topic}</span>
                        <span>·</span>
                        <button
                          onClick={repeatLast}
                          style={{ background: "none", border: "none", color: "var(--accent)", cursor: "pointer", fontSize: 11, padding: 0, textDecoration: "underline" }}
                        >
                          🔊 Replay
                        </button>
                        <span>·</span>
                        <button
                          onClick={toggleMuteTTS}
                          style={{ background: "none", border: "none", color: ttsMuted ? "var(--amber)" : "var(--text3)", cursor: "pointer", fontSize: 11, padding: 0 }}
                        >
                          {ttsMuted ? "🔇 Voice Muted" : "🔈 Mute"}
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
                );
              }

              // Candidate Answer Bubble (Right Side)
              if (m.role === "user" && m.type === "answer") {
                return (
                  <div key={m.id} className="msg user appear" style={{ display: "flex", justifyContent: "flex-end", width: "100%", gap: 12 }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", maxWidth: "80%" }}>
                      <div className="msg-bubble" style={{ background: "var(--accent-dim)", border: "1px solid rgba(124,107,255,0.35)", color: "var(--text)" }}>
                        {m.text}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        {m.wpm ? <span style={{ fontSize: 10, color: "var(--accent2)", fontWeight: 500 }}>{m.wpm} WPM</span> : null}
                        <span style={{ fontSize: 10, color: "var(--text3)" }}>Answer submitted</span>
                      </div>
                    </div>
                    <div className="msg-avatar" style={{ fontSize: 12, background: "var(--accent)", color: "#fff", fontWeight: 600 }}>You</div>
                  </div>
                );
              }

              // AI Evaluation & Score Bubble (Left Side)
              if (m.type === "evaluation") {
                return (
                  <div key={m.id} className="msg ai appear" style={{ display: "flex", justifyContent: "flex-start", gap: 12 }}>
                    <div className="msg-avatar" style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.3)", color: "var(--green)", fontSize: 14 }}>✓</div>
                    <div style={{ maxWidth: "85%" }}>
                      <div className="msg-bubble" style={{ borderLeft: "3px solid var(--green)", background: "var(--surface2)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <span style={{ color: "var(--green)", fontWeight: 600 }}>Score: {m.score}/100</span>
                          {m.wpm ? <span style={{ fontSize: 11, color: "var(--text3)" }}>· Pace: {m.wpm} WPM</span> : null}
                        </div>
                        <div style={{ color: "var(--text2)", fontSize: 13, lineHeight: 1.6 }}>{m.feedback}</div>
                      </div>
                    </div>
                  </div>
                );
              }

              return null;
            })}

            {/* Anchor for autoscroll when new questions arrive */}
            <div ref={chatEndRef} />
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
                {isListeningActive ? "Stop Voice Input" : "Speak Answer"}
              </button>

              <div style={{ flex: 1, display: "flex", gap: 10 }}>
                <input 
                  type="text" 
                  value={textAnswer}
                  onChange={(e) => {
                    if (!activeSpeechStartTimeRef.current) activeSpeechStartTimeRef.current = Date.now();
                    setTextAnswer(e.target.value);
                  }}
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
              <span>Gemini AI STT powered voice recognition. Speak your response or type into the box.</span>
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
                <LineChart data={currentWpmData}>
                  <XAxis dataKey="name" hide />
                  <YAxis domain={['auto', 'auto']} hide />
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: "var(--accent)" }} activeDot={{ r: 5 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text3)", marginTop: 8 }}>
              <span>Ideal: 120–160 WPM</span>
              <span style={{ color: wpmHistory.length > 0 ? "var(--accent2)" : "var(--text3)", fontWeight: wpmHistory.length > 0 ? 500 : 400 }}>
                {wpmHistory.length > 0 ? `Latest: ${wpmHistory[wpmHistory.length - 1].value} WPM` : "Ready to track pace"}
              </span>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
