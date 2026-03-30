import React from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";

const FEATURES = [
  { icon: "📄", title: "Resume Intelligence", desc: "Gemini 2.5 Flash parses your PDF into structured JSON and cross-validates every claim against your GitHub repositories." },
  { icon: "🎭", title: "Emotion Recognition", desc: "Tracks 7 facial expression states at 2 FPS using face-api.js — Happy, Sad, Fear, Angry, Surprise, Disgust, Neutral." },
  { icon: "🎙️", title: "Voice & Prosody", desc: "Deepgram STT with <300ms word-level timestamps, filler word tracking, WPM analysis, and pitch modulation scoring." },
  { icon: "🧠", title: "RAG-Powered Questions", desc: "LangChain + ChromaDB retrieves context from your GitHub README embeddings before generating every follow-up question." },
  { icon: "📊", title: "Performance Dashboard", desc: "Radar charts, WPM graphs, emotion heatmaps, and knowledge gap analysis — all in a single post-session report." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", overflow: "hidden", position: "relative" }}>
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none",
        backgroundImage: "linear-gradient(rgba(124,107,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(124,107,255,0.035) 1px, transparent 1px)",
        backgroundSize: "48px 48px",
      }} />
      <div style={{ position: "fixed", top: -200, right: -100, width: 700, height: 700, borderRadius: "50%", background: "rgba(124,107,255,0.1)", filter: "blur(100px)", pointerEvents: "none" }} />
      <div style={{ position: "fixed", bottom: -100, left: -100, width: 500, height: 500, borderRadius: "50%", background: "rgba(45,212,160,0.06)", filter: "blur(80px)", pointerEvents: "none" }} />

      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 48px", borderBottom: "1px solid var(--border)", position: "relative", zIndex: 10, backdropFilter: "blur(12px)" }}>
        <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 22 }}>AI<span style={{ color: "var(--accent2)" }}>CC</span></div>
        <div style={{ display: "flex", gap: 8 }}>
          {token ? (
            <button type="button" onClick={() => navigate("/dashboard")} style={navBtnStyle("#7c6bff", "#7c6bff", "white")}>Dashboard →</button>
          ) : (
            <>
              <button type="button" onClick={() => navigate("/login")} style={navBtnStyle("transparent", "var(--border2)", "var(--text2)")}>Sign in</button>
              <button type="button" onClick={() => navigate("/register")} style={navBtnStyle("var(--accent)", "var(--accent)", "white")}>Get Started</button>
            </>
          )}
        </div>
      </nav>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "80px 48px 60px", position: "relative", zIndex: 5 }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "var(--accent-dim)", border: "1px solid rgba(124,107,255,0.3)", borderRadius: 40, padding: "6px 16px", marginBottom: 32, fontSize: 13, color: "var(--accent2)" }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--green)", animation: "pulse 2s infinite" }} />
          Multimodal AI — Emotion + Voice + Code Analysis
        </div>
        <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: "clamp(42px, 6vw, 80px)", lineHeight: 1.05, letterSpacing: "-2px", marginBottom: 24, maxWidth: 900 }}>
          Bridge the <em style={{ fontStyle: "italic", color: "var(--accent2)" }}>Confidence–<br />Competence Gap</em>
        </h1>
        <p style={{ fontSize: 18, color: "var(--text2)", maxWidth: 560, lineHeight: 1.7, marginBottom: 48, fontWeight: 300 }}>
          Real-time AI interviews that analyze your words, voice, emotion, and GitHub — giving you the honest feedback no mock interviewer can.
        </p>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" onClick={() => navigate(token ? "/onboarding" : "/register")} style={{ ...primaryBtn, fontSize: 16, padding: "14px 36px" }}>Begin Your Session →</button>
          <button type="button" onClick={() => navigate(token ? "/dashboard" : "/login")} style={{ background: "none", color: "var(--text2)", border: "1px solid var(--border2)", padding: "14px 32px", borderRadius: 40, fontSize: 16, cursor: "pointer", fontFamily: "Outfit, sans-serif", transition: "all 0.2s" }}>
            {token ? "View Dashboard" : "Sign In"}
          </button>
        </div>

        <div style={{ display: "flex", gap: 48, marginTop: 72, paddingTop: 48, borderTop: "1px solid var(--border)", justifyContent: "center", flexWrap: "wrap" }}>
          {[["97%", "Resume claim verification"], ["<800ms", "AI response latency"], ["7", "Emotion states tracked"], ["2 FPS", "Real-time face inference"]].map(([n, l]) => (
            <div key={l} style={{ textAlign: "center" }}>
              <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 32, color: "var(--text)" }}>{n}</div>
              <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, padding: "0 48px 80px", position: "relative", zIndex: 5 }}>
        {FEATURES.map((f) => (
          <div key={f.title} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius)", padding: 24, transition: "border-color 0.2s" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border2)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}
          >
            <div style={{ fontSize: 28, marginBottom: 16 }}>{f.icon}</div>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>{f.title}</h3>
            <p style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.6 }}>{f.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

const navBtnStyle = (bg, border, color) => ({
  background: bg, border: `1px solid ${border}`, color,
  padding: "8px 20px", borderRadius: 40, cursor: "pointer",
  fontFamily: "Outfit, sans-serif", fontSize: 14, fontWeight: 500, transition: "all 0.2s",
});

const primaryBtn = {
  background: "var(--accent)", color: "white", border: "none",
  borderRadius: 40, fontFamily: "Outfit, sans-serif", fontWeight: 500,
  cursor: "pointer", transition: "all 0.2s", letterSpacing: "0.2px",
};
