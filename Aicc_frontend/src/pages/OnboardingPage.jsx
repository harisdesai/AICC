import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { Button, Input, Card, Spinner } from "../components/ui";

const ROLES = [
  "Backend Engineer",
  "Full Stack",
  "ML Engineer",
  "DevOps / SRE",
  "Data Scientist",
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [resumeId, setResumeId] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [targetRole, setTargetRole] = useState(ROLES[0]);
  const [githubUrl, setGithubUrl] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    setUploading(true);
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

  const startSession = async (e) => {
    e.preventDefault();
    if (!resumeId) { setError("Upload a resume first"); return; }
    setError("");
    setCreating(true);
    try {
      const { data } = await api.post("/sessions", {
        resumeId,
        targetRole,
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
    <div style={{ minHeight: "100vh", padding: "48px 24px", background: "var(--bg)" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 26, marginBottom: 8 }}>Onboarding</div>
        <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 32 }}>Upload your resume, then choose a role and optional GitHub profile for RAG context.</p>

        {step === 1 && (
          <Card style={{ padding: 28 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>1. Resume (PDF)</div>
            <label style={{ display: "block", cursor: "pointer", border: "1px dashed var(--border2)", borderRadius: "var(--radius)", padding: 32, textAlign: "center", color: "var(--text2)" }}>
              {uploading ? <Spinner /> : "Click to choose PDF"}
              <input type="file" accept="application/pdf" style={{ display: "none" }} onChange={onFile} disabled={uploading} />
            </label>
            {error && <p style={{ color: "var(--red)", fontSize: 13, marginTop: 12 }}>{error}</p>}
          </Card>
        )}

        {step === 2 && (
          <Card style={{ padding: 28 }}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>2. Interview focus</div>
            <form onSubmit={startSession} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <label style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.8px" }}>Target role</label>
                <select
                  value={targetRole}
                  onChange={(e) => setTargetRole(e.target.value)}
                  style={{
                    marginTop: 8, width: "100%", padding: "12px 14px", borderRadius: "var(--radius-sm)",
                    background: "var(--bg3)", border: "1px solid var(--border2)", color: "var(--text)", fontSize: 14,
                  }}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <Input label="GitHub profile URL (optional)" value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)} placeholder="https://github.com/username" />
              {error && <p style={{ color: "var(--red)", fontSize: 13 }}>{error}</p>}
              <Button type="submit" loading={creating} size="lg">Start interview</Button>
            </form>
          </Card>
        )}
      </div>
    </div>
  );
}
