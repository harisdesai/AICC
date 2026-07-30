import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { Button, Input, Card, Spinner, Tag } from "../components/ui";

const ROLES = [
  "Backend Engineer",
  "Full Stack",
  "ML Engineer",
  "DevOps / SRE",
  "Data Scientist",
];

const DIFFICULTIES = [
  { id: "easy", label: "🟢 Easy", desc: "Foundational & entry level" },
  { id: "medium", label: "🟡 Medium", desc: "Standard practical systems" },
  { id: "hard", label: "🔴 Hard", desc: "Staff / FAANG & deep internals" },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [resumeId, setResumeId] = useState(null);
  const [resumeName, setResumeName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [targetRole, setTargetRole] = useState(ROLES[0]);
  const [difficulty, setDifficulty] = useState("medium");
  const [githubUrl, setGithubUrl] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [dragging, setDragging] = useState(false);

  const processFile = async (file) => {
    if (!file) return;
    setError("");
    setUploading(true);
    setResumeName(file.name);
    try {
      const fd = new FormData();
      fd.append("resume", file);
      const { data } = await api.post("/resume", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResumeId(data.resume.id);
      setStep(2);
    } catch (err) {
      setError(err.response?.data?.error || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const onFile = (e) => {
    processFile(e.target.files?.[0]);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    processFile(e.dataTransfer.files?.[0]);
  };

  const startSession = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!resumeId) { setError("Upload a resume first"); return; }
    setError("");
    setCreating(true);
    try {
      const { data } = await api.post("/sessions", {
        resumeId,
        targetRole,
        difficulty,
        githubUrl: githubUrl.trim() || undefined,
      });
      navigate(`/interview/${data.session.id}`);
    } catch (err) {
      setError(err.response?.data?.error || "Could not start session");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "48px 24px", background: "var(--bg)", display: "flex", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 680 }}>
        
        <div className="appear step-indicator">
          <div className={`step ${step >= 1 ? "active" : "pending"}`}>
            <div className="step-dot">1</div>
            <span style={{ fontSize: 13, color: step >= 1 ? "var(--text2)" : "var(--text3)" }}>Profile</span>
          </div>
          <div className="step-line" />
          <div className={`step ${step >= 2 ? "active" : "pending"}`}>
            <div className="step-dot">2</div>
            <span style={{ fontSize: 13, color: step >= 2 ? "var(--text2)" : "var(--text3)" }}>Job & Level</span>
          </div>
          <div className="step-line" />
          <div className={`step pending`}>
            <div className="step-dot">3</div>
            <span style={{ fontSize: 13, color: "var(--text3)" }}>Interview</span>
          </div>
        </div>

        <div className="appear delay-1" style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: 36, marginBottom: 12, letterSpacing: "-1px" }}>Set up your profile</h2>
          <p style={{ color: "var(--text2)", fontSize: 15 }}>Upload your resume, pick your target difficulty level, and link your developer profiles.</p>
        </div>

        {step === 1 && (
          <div className="appear delay-2">
            <label 
              className={`drop-zone ${dragging ? 'dragging' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              style={{ display: "block" }}
            >
              <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={onFile} disabled={uploading} />
              
              {uploading ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  <Spinner size={40} />
                  <h3 style={{ fontSize: 16, fontWeight: 500, marginTop: 16, marginBottom: 8 }}>Parsing Resume...</h3>
                  <p style={{ fontSize: 13, color: "var(--text3)" }}>Extracting skills and timeline</p>
                </div>
              ) : resumeId ? (
                <>
                  <div className="drop-icon" style={{ color: "var(--green)" }}>✓</div>
                  <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8, color: "var(--green)" }}>{resumeName}</h3>
                  <p style={{ fontSize: 13, color: "var(--text2)" }}>Ready to proceed</p>
                </>
              ) : (
                <>
                  <div className="drop-icon">📎</div>
                  <h3 style={{ fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Drop your resume here</h3>
                  <p style={{ fontSize: 13, color: "var(--text3)" }}>PDF format · Max 5MB</p>
                </>
              )}
            </label>
            {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 12, textAlign: "center" }}>{error}</p>}
          </div>
        )}

        {step === 2 && (
          <div className="appear delay-1">
            <Card style={{ padding: 32, marginBottom: 32 }}>
              <form onSubmit={startSession} style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                
                {/* Target Role */}
                <div>
                  <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.8px" }}>Target Role</p>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <input
                      type="text"
                      className="url-input"
                      value={targetRole}
                      onChange={(e) => setTargetRole(e.target.value)}
                      placeholder="e.g. Backend Engineer — Python, AWS"
                      style={{ flex: 1, background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontFamily: "Outfit, sans-serif", fontSize: 14, outline: "none" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                    {ROLES.map((role) => (
                      <span key={role} className="tag accent hover-scale" style={{ cursor: "pointer" }} onClick={() => setTargetRole(role)}>
                        {role}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Question Difficulty Selection */}
                <div>
                  <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.8px" }}>Interview Difficulty</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                    {DIFFICULTIES.map((d) => (
                      <div
                        key={d.id}
                        onClick={() => setDifficulty(d.id)}
                        style={{
                          padding: "14px 16px",
                          borderRadius: "var(--radius-sm)",
                          border: difficulty === d.id ? "2px solid var(--accent)" : "1px solid var(--border2)",
                          background: difficulty === d.id ? "var(--accent-dim)" : "var(--bg3)",
                          cursor: "pointer",
                          transition: "all 0.2s ease"
                        }}
                      >
                        <div style={{ fontWeight: 600, fontSize: 14, color: difficulty === d.id ? "var(--accent2)" : "var(--text)" }}>{d.label}</div>
                        <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 4 }}>{d.desc}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Developer Profiles */}
                <div>
                  <p style={{ fontSize: 13, color: "var(--text3)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.8px" }}>Professional Profiles</p>
                  <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                    <input
                      className="url-input"
                      type="text"
                      placeholder="🐙  github.com/your-username"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      style={{ flex: 1, background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontFamily: "Outfit, sans-serif", fontSize: 14, outline: "none" }}
                    />
                  </div>
                </div>

                {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
              </form>
            </Card>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 32 }}>
          <Button variant="ghost" onClick={() => step === 2 ? setStep(1) : navigate("/dashboard")} style={{ fontSize: 14, padding: "12px 24px" }}>← Back</Button>
          <Button variant="primary" onClick={step === 2 ? startSession : undefined} loading={creating} disabled={step !== 2} style={{ fontSize: 15, padding: "12px 32px" }}>
            Begin Interview →
          </Button>
        </div>

      </div>
    </div>
  );
}
