import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import api from "../lib/api";
import { useInterviewSocket } from "../hooks/useInterviewSocket";
import { useMicrophone } from "../hooks/useMicrophone";
import { useEmotionDetection } from "../hooks/useEmotionDetection";
import { Button, Card, Tag, Spinner } from "../components/ui";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, CartesianGrid } from "recharts";

export default function InterviewPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const videoRef = useRef(null);

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
  
  // UI States
  const [latestEmotion, setLatestEmotion] = useState({ neutral: 1, happy: 0, sad: 0, fearful: 0, surprised: 0, disgusted: 0, angry: 0 });
  const [timerSeconds, setTimerSeconds] = useState(0);

  const handleTextSubmit = () => {
    if (!textAnswer.trim()) return;
    sendRef.current("text_answer", { text: textAnswer.trim() });
    setTextAnswer("");
  };

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

  // Timer
  useEffect(() => {
    if (!interviewStarted) return;
    const interval = setInterval(() => {
      setTimerSeconds(s => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [interviewStarted]);

  const formatTimer = (s) => {
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs < 10 ? '0' : ''}${secs}`;
  };

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

  const onMessage = useCallback((msg) => {
    if (msg.type === "auth_ok" && sessionPayload && !startedRef.current) {
      startedRef.current = true;
      sendRef.current("start_session", {
        sessionId,
        targetRole: sessionPayload.session.target_role,
        resumeJson: sessionPayload.resume?.raw_json || {},
      });
      setWsReady(true);
      return;
    }
    if (msg.type === "auth_error") {
      setErr(msg.message || "Auth failed");
      return;
    }
    if (msg.type === "question") {
      setQuestion(msg);
      setPartial("");
      return;
    }
    if (msg.type === "transcript_partial") {
      setPartial(msg.text || "");
      return;
    }
    if (msg.type === "transcript_final") {
      setPartial("");
      return;
    }
    if (msg.type === "evaluation") {
      setEvaluations((prev) => [...prev, msg]);
      return;
    }
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
  }, [sessionPayload, sessionId, navigate]);

  const sendRef = useRef(() => {});
  const { connect, send, sendAudio, disconnect } = useInterviewSocket({ onMessage, token });
  sendRef.current = send;
  sendAudioRef.current = sendAudio;

  const { start: startMic, stop: stopMic, active: micActive, error: micError } = useMicrophone({
    mediaStream,
    onAudioChunk: useCallback((buf) => sendAudioRef.current(buf), []),
  });

  useEffect(() => {
    if (token && !loading && sessionPayload && interviewStarted) connect();
    return () => disconnect();
  }, [token, loading, sessionPayload, interviewStarted, connect, disconnect]);

  const emotionSendRef = useRef(() => {});
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

  const { ready: faceReady, start: startFace, stop: stopFace } = useEmotionDetection({
    videoRef,
    onEmotion: (e) => emotionSendRef.current(e),
    intervalMs: 500,
  });

  useEffect(() => {
    if (mediaStream && faceReady && interviewStarted) startFace();
    return () => stopFace();
  }, [mediaStream, faceReady, startFace, stopFace, interviewStarted]);

  const endSession = async () => {
    stopMic();
    disconnect();
    try {
      if (startedRef.current) await api.post(`/sessions/${sessionId}/finalize`);
    } catch (_) { }
    navigate(`/report/${sessionId}`);
  };

  const getDominantEmotion = () => {
    const highest = Object.keys(latestEmotion).reduce((a, b) => latestEmotion[a] > latestEmotion[b] ? a : b);
    return { name: highest, value: latestEmotion[highest] };
  };
  const domE = getDominantEmotion();

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

  // Centered setup if interview has NOT started
  if (!interviewStarted) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Card style={{ padding: 48, maxWidth: 500, width: "100%", textAlign: "center" }}>
          <div style={{ fontSize: 24, fontWeight: 600, marginBottom: 16, fontFamily: "DM Serif Display, serif" }}>Ready to begin?</div>
          <p style={{ color: "var(--text2)", marginBottom: 32, lineHeight: 1.6 }}>
            Click below to initialize your microphone context and connect to the AI Engine. Please ensure you are in a quiet room and your camera is positioned well.
          </p>
          <Button size="lg" onClick={() => { setInterviewStarted(true); setTimeout(startMic, 500); }} style={{ width: "100%" }}>
            Start Interview
          </Button>
          <Button variant="ghost" style={{ marginTop: 16, width: "100%" }} onClick={() => navigate("/dashboard")}>Cancel</Button>
        </Card>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      {/* Top Nav */}
      <nav style={{ padding: "16px 24px", borderBottom: "1px solid var(--border)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", height: 65 }}>
        <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 18 }}>
          AI<span style={{ color: "var(--accent)" }}>CC</span> — <span style={{ fontSize: 14, color: "var(--text2)", fontFamily: "Outfit, sans-serif", fontWeight: 400 }}>{sessionPayload?.session?.target_role || "Interview Session"}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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

            {/* Audio Waveform Panel */}
            <div style={{ flex: 1, background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "1px" }}>Live Transcription — AssemblyAI</div>
                <div style={{ fontSize: 12, color: "var(--text3)" }}>~WPM <span style={{ color: "var(--text)" }}>142</span></div>
              </div>
              <div className="waveform">
                {Array.from({ length: 30 }).map((_, i) => (
                  <div key={i} className="wave-bar" style={{ animationDelay: `${i * 0.04}s`, height: `${Math.max(8, Math.random() * (micActive && partial ? 40 : 8))}px` }}></div>
                ))}
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.7, background: "var(--bg4)", borderRadius: "var(--radius-sm)", padding: 12, flex: 1, fontStyle: "italic", overflowY: "auto", maxHeight: 80 }}>
                {partial ? `"${partial}..."` : "Listening for speech..."}
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
                    <span style={{ color: "var(--green)", fontWeight: 600 }}>Score: {ev.score}</span>{" "}—{" "}{ev.feedback}
                  </div>
                </div>
              </div>
            ))}
            
            {question && (
              <div className="msg ai appear">
                <div className="msg-avatar">🤖</div>
                <div>
                  <div className="msg-bubble">{question.text}</div>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>Topic: {question.topic}</div>
                </div>
              </div>
            )}
            
            {(partial || textAnswer) && (
              <div className="msg user appear">
                <div className="msg-avatar" style={{ fontSize: 12 }}>You</div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: '100%' }}>
                  <div className="msg-bubble">{textAnswer || partial}</div>
                </div>
              </div>
            )}
            
            {!question && (
              <div className="msg ai appear">
                <div className="msg-avatar">🤖</div>
                <div>
                  <div className="msg-bubble" style={{ color: "var(--text3)", fontStyle: "italic" }}>
                    <Spinner size={14} /> Generating context...
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, padding: 16, background: "var(--bg2)", borderTop: "1px solid var(--border)", borderRadius: "var(--radius)" }}>
            <button 
              onClick={() => micActive ? stopMic() : startMic()}
              disabled={!mediaStream}
              style={{ display: "flex", alignItems: "center", gap: 8, background: micActive ? "var(--red-dim)" : "var(--bg3)", border: "1px solid", borderColor: micActive ? "var(--red)" : "var(--border2)", color: micActive ? "var(--red)" : "var(--text2)", borderRadius: 40, padding: "10px 20px", fontSize: 14, cursor: "pointer", fontFamily: "Outfit, sans-serif", transition: "all 0.2s" }}
            >
              <span>{micActive ? "🔴" : "🎙️"}</span> {micActive ? "Mute Mic" : "Unmute Mic"}
            </button>
            <div style={{ flex: 1, display: "flex", gap: 10 }}>
              <input 
                type="text" 
                value={textAnswer}
                onChange={(e) => setTextAnswer(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleTextSubmit(); }}
                placeholder="Fallback: Type answer..." 
                style={{ flex: 1, padding: "10px 14px", borderRadius: 40, border: "1px solid var(--border)", background: "transparent", color: "var(--text)", fontSize: 13, outline: "none" }} 
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", whiteSpace: "nowrap" }}>
              Q {question ? question.questionNumber : "?"} / {question ? (question.totalQuestions || 12) : 12}
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
