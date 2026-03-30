import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import api from "../lib/api";
import { useInterviewSocket } from "../hooks/useInterviewSocket";
import { useMicrophone } from "../hooks/useMicrophone";
import { useEmotionDetection } from "../hooks/useEmotionDetection";
import { Button, Card, Tag, Spinner } from "../components/ui";

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

  useEffect(() => {
    if (!sessionPayload) return undefined;
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
  }, [sessionPayload]);

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
    if (mediaStream && faceReady) startFace();
    return () => stopFace();
  }, [mediaStream, faceReady, startFace, stopFace]);

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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 24 }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 22 }}>Live interview</div>
          <Tag>{sessionPayload?.session?.target_role}</Tag>
        </div>

        {features && (!features.groq || !features.deepgram || !features.gemini) && (
          <Card style={{ padding: 16, marginBottom: 16, borderColor: "var(--amber)", background: "var(--amber-dim)" }}>
            <div style={{ fontWeight: 600, marginBottom: 8, color: "var(--amber)" }}>Server feature keys</div>
            <ul style={{ fontSize: 13, color: "var(--text2)", paddingLeft: 20, lineHeight: 1.6 }}>
              {!features.groq && <li><strong>GROQ_API_KEY</strong> — interview questions &amp; scoring (console.groq.com)</li>}
              {!features.deepgram && <li><strong>DEEPGRAM_API_KEY</strong> — live speech &amp; answer detection (console.deepgram.com)</li>}
              {!features.gemini && <li><strong>GEMINI_API_KEY</strong> — resume PDF parsing (Google AI Studio)</li>}
            </ul>
            <p style={{ fontSize: 12, color: "var(--text3)", marginTop: 8 }}>Restart the API after editing <code style={{ fontSize: 11 }}>.env</code>. RAG/Chroma is optional for GitHub context.</p>
          </Card>
        )}

        <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 20 }}>
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            style={{ 
              width: "100%", 
              maxWidth: 280, 
              borderRadius: 12, 
              transform: "scaleX(-1)",
              objectFit: "cover",
              backgroundColor: "#000",
              boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
              alignSelf: "flex-start"
            }}
          />

          <div style={{ flex: 1, minWidth: 280 }}>
            {err && <div style={{ color: "var(--amber)", marginBottom: 16, fontSize: 14 }}>{err}</div>}
            {micError && <div style={{ color: "var(--red)", marginBottom: 16, fontSize: 14 }}>Mic Error: {micError}</div>}

            <Card style={{ padding: 28, height: "100%" }}>
              {!interviewStarted ? (
                <div style={{ textAlign: "center", padding: "32px 0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 12 }}>Ready to begin?</div>
                  <p style={{ color: "var(--text2)", marginBottom: 24, padding: "0 20px" }}>Click below to initialize your microphone context and connect to the AI Engine. Please ensure you are in a quiet room.</p>
                  <Button size="lg" onClick={() => { setInterviewStarted(true); startMic(); }}>
                    Start Interview (Enable Audio)
                  </Button>
                </div>
              ) : question ? (
                <>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Question {question.questionNumber} / {question.totalQuestions || 12}</div>
                  <p style={{ fontSize: 17, lineHeight: 1.6 }}>{question.text}</p>
                  <p style={{ fontSize: 13, color: "var(--text2)", marginTop: 12 }}>Topic: {question.topic}</p>
                </>
              ) : (
                <div style={{ textAlign: "center", padding: "40px" }}>
                  <Spinner />
                  <p style={{ color: "var(--text2)", marginTop: 16 }}>Connecting... speak clearly when the first question appears.</p>
                </div>
              )}
            </Card>
          </div>
        </div>

        <Card style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Live transcript</div>
          <p style={{ minHeight: 48, color: "var(--text2)", fontSize: 14 }}>{partial || "…"}</p>
        </Card>

        <Card style={{ padding: 20, marginBottom: 20 }}>
          <div style={{ fontWeight: 500, marginBottom: 12 }}>Type your answer (Fallback)</div>
          <div style={{ display: "flex", gap: 10 }}>
            <input 
              type="text" 
              value={textAnswer}
              onChange={(e) => setTextAnswer(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleTextSubmit(); }}
              placeholder="Type your answer here if mic isn't working..." 
              style={{ flex: 1, padding: "10px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "transparent", color: "var(--text)" }} 
            />
            <Button onClick={handleTextSubmit}>Send Answer</Button>
          </div>
        </Card>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
          <Button variant={micActive ? "success" : "ghost"} onClick={() => (micActive ? stopMic() : startMic())}>
            Mic: {micActive ? "on" : "off"}
          </Button>
          <Button variant="ghost" onClick={async () => {
            stopMic();
            disconnect();
            try {
              if (startedRef.current) await api.post(`/sessions/${sessionId}/finalize`);
            } catch (_) { }
            navigate(`/report/${sessionId}`);
          }}>End & get report</Button>
        </div>

        {evaluations.length > 0 && (
          <Card style={{ padding: 20 }}>
            <div style={{ fontWeight: 600, marginBottom: 12 }}>Latest feedback</div>
            {evaluations.slice(-1).map((ev, i) => (
              <div key={i} style={{ fontSize: 14, color: "var(--text2)" }}>
                <strong style={{ color: "var(--green)" }}>{ev.score}</strong>
                {" — "}
                {ev.feedback}
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
