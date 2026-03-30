import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import api from "../lib/api";
import { Button, Card, Spinner, Tag } from "../components/ui";

export default function DashboardPage() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState(null);
  const [githubReview, setGithubReview] = useState(null);


  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, s] = await Promise.all([api.get("/profile"), api.get("/sessions")]);
        if (!cancelled) {
          setProfile(p.data);
          setSessions(s.data.sessions || []);
          
          if (p.data?.resumes?.length > 0) {
            try {
              const { data } = await api.get("/resume/latest/review");
              setReview(data.review || data);
              if (data.githubReview) {
                setGithubReview(data.githubReview);
              }
            } catch (_) {}
          }
        }
      } catch (_) {
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div className="appear" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 26 }}>Dashboard</div>
            <p style={{ color: "var(--text2)", marginTop: 6 }}>{user?.name || profile?.user?.name || "Welcome"}</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
            {user?.email === "admin@123" && (
              <Button variant="secondary" onClick={() => navigate("/admin")}>Admin Panel</Button>
            )}
            <Button onClick={() => navigate("/onboarding")}>New interview</Button>
            <Button variant="ghost" onClick={() => { logout(); navigate("/"); }}>Log out</Button>
          </div>
        </div>

        {review && (
          <Card className="appear delay-1 hover-card" style={{ padding: 24, marginBottom: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Resume Review Report</div>
              <div style={{ background: "var(--indigo-dim)", color: "var(--indigo)", padding: "4px 12px", borderRadius: 16, fontWeight: 600 }}>
                ATS Score: {review.score}
              </div>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8, color: "var(--green)" }}>Key Strengths</div>
              <ul style={{ paddingLeft: 20, fontSize: 14, color: "var(--text2)", margin: 0, lineHeight: 1.6 }}>
                {review.strengths?.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 500, marginBottom: 8, color: "var(--amber)" }}>Actionable Improvements</div>
              <ul style={{ paddingLeft: 20, fontSize: 14, color: "var(--text2)", margin: 0, lineHeight: 1.6 }}>
                {review.improvements?.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
            
            {review.missingKeywords?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: "var(--red)", fontSize: 14 }}>Missing Keywords to Consider</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {review.missingKeywords.map((k, i) => <Tag key={i}>{k}</Tag>)}
                </div>
              </div>
            )}

            {review.bullet_critiques?.length > 0 && (
              <div>
                <div style={{ fontWeight: 500, marginBottom: 12, color: "var(--indigo)" }}>Structural Bullet Rewrites</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {review.bullet_critiques.map((crit, i) => (
                    <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", padding: 14, borderRadius: 8 }}>
                      <div style={{ fontSize: 13, color: "var(--red)", marginBottom: 6, textDecoration: "line-through" }}>{crit.original}</div>
                      <div style={{ fontSize: 13, color: "var(--green)", marginBottom: 8, fontWeight: 500 }}>{crit.rewrite}</div>
                      <div style={{ fontSize: 12, color: "var(--text3)" }}>Why: {crit.reason}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {githubReview && (
          <Card className="appear delay-1 hover-card" style={{ padding: 24, marginBottom: 28, background: "var(--bg3)", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>GitHub Profile Analysis</div>
              <div style={{ background: "var(--indigo-dim)", color: "var(--indigo)", padding: "4px 12px", borderRadius: 16, fontWeight: 600 }}>
                Score: {githubReview.score}
              </div>
            </div>
            
            <p style={{ fontSize: 14, color: "var(--text)", marginBottom: 16, lineHeight: 1.6 }}>
              {githubReview.summary}
            </p>

            {githubReview.strengths?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: "var(--green)" }}>Key Strengths</div>
                <ul style={{ paddingLeft: 20, fontSize: 14, color: "var(--text2)", margin: 0, lineHeight: 1.6 }}>
                  {githubReview.strengths.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
            
            {githubReview.areas_for_growth?.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontWeight: 500, marginBottom: 8, color: "var(--amber)" }}>Areas For Growth</div>
                <ul style={{ paddingLeft: 20, fontSize: 14, color: "var(--text2)", margin: 0, lineHeight: 1.6 }}>
                  {githubReview.areas_for_growth.map((s, i) => <li key={i}>{s}</li>)}
                </ul>
              </div>
            )}
          </Card>
        )}

        {profile?.stats && (
          <div className="appear delay-2" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 28 }}>
            <Card className="hover-card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>Sessions</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{profile.stats.total_sessions || 0}</div>
            </Card>
            <Card className="hover-card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>Avg score</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{profile.stats.avg_score ?? "—"}</div>
            </Card>
            <Card className="hover-card" style={{ padding: 18 }}>
              <div style={{ fontSize: 11, color: "var(--text3)" }}>Best</div>
              <div style={{ fontSize: 24, fontWeight: 600 }}>{profile.stats.best_score ?? "—"}</div>
            </Card>
          </div>
        )}

        <div style={{ fontWeight: 600, marginBottom: 14 }}>Your sessions</div>
        {sessions.length === 0 ? (
          <Card style={{ padding: 28, color: "var(--text2)" }}>No sessions yet. Start one from onboarding.</Card>
        ) : (
          <div className="appear delay-3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sessions.map((row) => (
              <div
                key={row.id}
                className="hover-card cursor-pointer"
                onClick={() => navigate(row.status === "active" ? `/interview/${row.id}` : `/report/${row.id}`)}
                style={{
                  background: "var(--surface)", border: "1px solid var(--border)",
                  borderRadius: "var(--radius)", padding: 20,
                  display: "flex", alignItems: "center", gap: 16,
                  transition: "border-color 0.15s"
                }}
              >
                <div style={{
                  width: 48, height: 48, borderRadius: "var(--radius-sm)",
                  background: "var(--accent-dim)", border: "1px solid rgba(124,107,255,0.2)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
                  flexShrink: 0
                }}>
                  {row.status === 'active' ? '🎙️' : '💼'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>
                    {row.target_role || "Interview Session"}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--text3)", display: "flex", alignItems: "center", gap: 8 }}>
                    {new Date(row.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    {" · "}
                    {row.status === 'active' ? (
                      <span className="tag amber" style={{ fontSize: 10 }}>In Progress</span>
                    ) : (
                      <span className="tag green" style={{ fontSize: 10 }}>Completed</span>
                    )}
                  </div>
                </div>
                {row.overall_score != null && (
                  <div style={{ fontSize: 22, fontWeight: 600, color: "var(--green)", fontFamily: "'DM Mono', monospace" }}>
                    {row.overall_score}
                  </div>
                )}
                <div style={{ marginLeft: 8, color: "var(--text3)" }}>→</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
