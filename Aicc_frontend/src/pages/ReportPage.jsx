import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { Button, Card, ScoreRing, Spinner, Tag } from "../components/ui";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar, Cell } from "recharts";

export default function ReportPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: d } = await api.get(`/sessions/${sessionId}/report`);
        if (!cancelled) setData(d);
      } catch (e) {
        if (!cancelled) setErr(e.response?.data?.error || "Failed to load report");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <Spinner />
      </div>
    );
  }

  if (err || !data) {
    return (
      <div style={{ padding: 48 }}>
        <p style={{ color: "var(--red)" }}>{err || "No data"}</p>
        <Button style={{ marginTop: 16 }} onClick={() => navigate("/dashboard")}>Dashboard</Button>
      </div>
    );
  }

  const radarData = [
    { subject: "Technical", score: Math.round(data.technicalScore || 0), fullMark: 100 },
    { subject: "Communication", score: Math.round(data.commScore || 0), fullMark: 100 },
  ];

  // Dummy data for visual completion based on HTML design
  const wpmData = [
    { name: 'Q1', value: 120 }, { name: 'Q2', value: 128 }, { name: 'Q3', value: 145 },
    { name: 'Q4', value: 142 }, { name: 'Q5', value: 160 }, { name: 'Q6', value: 138 },
  ];
  
  const fillerData = [
    { name: 'Q1', value: 3 }, { name: 'Q2', value: 6 }, { name: 'Q3', value: 6 },
    { name: 'Q4', value: 4 }, { name: 'Q5', value: 8 }, { name: 'Q6', value: 5 },
  ];

  const getDominantTotal = () => {
    if (!data.emotions || !data.emotions.length) return "Neutral";
    return data.emotions[0]?.dominant || "Neutral";
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", background: "var(--bg)", overflow: "hidden" }}>
      
      {/* Top Nav */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 32px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 22 }}>
          AI<span style={{ color: "var(--accent)" }}>CC</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>← Back to Dashboard</Button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", flex: 1, gap: 0, overflow: "hidden" }}>
        
        {/* Sidebar Nav */}
        <div style={{ borderRight: "1px solid var(--border)", background: "var(--bg2)", padding: 24, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto" }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 8 }}>Report Sections</div>
            
            <div 
              onClick={() => setActiveTab('overview')}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: 14, cursor: "pointer", transition: "all 0.15s", background: activeTab === 'overview' ? "var(--accent-dim)" : "transparent", color: activeTab === 'overview' ? "var(--accent2)" : "var(--text2)", border: activeTab === 'overview' ? "1px solid rgba(124,107,255,0.2)" : "1px solid transparent" }}
            >
              <span style={{ fontSize: 16 }}>📊</span> Performance
            </div>
            
            <div 
              onClick={() => setActiveTab('transcript')}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: 14, cursor: "pointer", transition: "all 0.15s", background: activeTab === 'transcript' ? "var(--accent-dim)" : "transparent", color: activeTab === 'transcript' ? "var(--accent2)" : "var(--text2)", border: activeTab === 'transcript' ? "1px solid rgba(124,107,255,0.2)" : "1px solid transparent" }}
            >
              <span style={{ fontSize: 16 }}>📝</span> Transcript & Feedback
            </div>
            
            <div 
              onClick={() => setActiveTab('gaps')}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-sm)", fontSize: 14, cursor: "pointer", transition: "all 0.15s", background: activeTab === 'gaps' ? "var(--accent-dim)" : "transparent", color: activeTab === 'gaps' ? "var(--accent2)" : "var(--text2)", border: activeTab === 'gaps' ? "1px solid rgba(124,107,255,0.2)" : "1px solid transparent" }}
            >
              <span style={{ fontSize: 16 }}>🎯</span> Knowledge Gaps
            </div>
          </div>

          <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <div style={{ background: "var(--accent-dim)", border: "1px solid rgba(124,107,255,0.2)", borderRadius: "var(--radius-sm)", padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{data.session?.target_role || "Session"}</div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>
                {new Date(data.session?.created_at).toLocaleDateString()}
              </div>
              <div style={{ fontSize: 24, fontWeight: 600, color: "var(--green)", marginBottom: 4 }}>
                {Math.round(data.overallScore || 0)}<span style={{ fontSize: 14, color: "var(--text3)" }}>/100</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)" }}>Overall Score</div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div style={{ overflowY: "auto", padding: "32px 48px", background: "var(--bg)" }}>

          {activeTab === 'overview' && (
            <div className="appear">
              <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: 30, letterSpacing: "-0.5px", marginBottom: 8 }}>Session Report</h2>
              <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 32 }}>Comprehensive performance analytics across technical knowledge, delivery, and emotional composition.</p>

              {/* Metrics Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
                <Card style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>Technical Score</div>
                  <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, marginBottom: 8, color: "var(--green)" }}>{Math.round(data.technicalScore || 0)}</div>
                </Card>
                <Card style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>Avg WPM</div>
                  <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, marginBottom: 8, color: "var(--accent2)" }}>138</div>
                  <div style={{ fontSize: 12, color: "var(--text3)" }}>Ideal range: 120–160</div>
                </Card>
                <Card style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>Filler Words/Min</div>
                  <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1, marginBottom: 8, color: "var(--amber)" }}>4.2</div>
                  <div style={{ fontSize: 12, color: "var(--red)" }}>↓ Target: &lt;3.0</div>
                </Card>
                <Card style={{ padding: 20 }}>
                  <div style={{ fontSize: 12, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 12 }}>Dominant Emotion</div>
                  <div style={{ fontSize: 26, fontWeight: 600, lineHeight: 1, marginBottom: 8, color: "var(--text)", textTransform: "capitalize", paddingTop: 4 }}>{getDominantTotal()}</div>
                </Card>
              </div>

              {/* Charts Row 1 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 20, marginBottom: 24 }}>
                <Card style={{ padding: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Skill Radar</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>Evaluated competencies vs ideal threshold</div>
                  <div style={{ height: 260, position: "relative" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                        <PolarGrid stroke="var(--border2)" />
                        <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--text2)", fontSize: 12 }} />
                        <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "var(--text3)", fontSize: 10 }} />
                        <Radar name="Score" dataKey="score" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.4} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card style={{ padding: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Speaking Pace (WPM)</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>Words per minute breakdown across questions</div>
                  <div style={{ height: 260, position: "relative", marginLeft: -20 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={wpmData}>
                        <XAxis dataKey="name" tick={{ fill: "var(--text3)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[90, 180]} tick={{ fill: "var(--text3)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <Line type="monotone" dataKey="value" stroke="var(--accent)" strokeWidth={3} fill="rgba(124,107,255,0.1)" dot={{ r: 4, fill: "var(--accent)" }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              {/* Charts Row 2 */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(380px, 1fr))", gap: 20, marginBottom: 24 }}>
                <Card style={{ padding: 24 }}>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Communication Quality</div>
                  <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 20 }}>Filler words detected per question</div>
                  <div style={{ height: 220, position: "relative", marginLeft: -20 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={fillerData}>
                        <XAxis dataKey="name" tick={{ fill: "var(--text3)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 12]} tick={{ fill: "var(--text3)", fontSize: 12 }} axisLine={false} tickLine={false} />
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                          {fillerData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.value >= 6 ? "var(--red)" : entry.value >= 4 ? "var(--amber)" : "var(--green)"} fillOpacity={0.8} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card style={{ padding: 24 }}>
                  <div style={{ fontWeight: 600, marginBottom: 16 }}>Emotional Composure</div>
                  {data.emotions && data.emotions.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {data.emotions.map((e, i) => {
                        const total = data.emotions.reduce((acc, curr) => acc + parseInt(curr.count, 10), 0);
                        const pct = Math.round((parseInt(e.count, 10) / total) * 100);
                        return (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 70, fontSize: 13, color: "var(--text2)", textTransform: "capitalize" }}>{e.dominant}</div>
                            <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                              <div style={{ width: `${pct}%`, height: "100%", background: i === 0 ? "var(--accent)" : i === 1 ? "var(--green)" : "var(--amber)" }} />
                            </div>
                            <div style={{ width: 36, fontSize: 13, fontWeight: 500, textAlign: "right" }}>{pct}%</div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ color: "var(--text3)", fontSize: 14 }}>No visual tracking data captured.</div>
                  )}
                </Card>
              </div>

            </div>
          )}

          {activeTab === 'transcript' && (
            <div className="appear">
              <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: 30, letterSpacing: "-0.5px", marginBottom: 8 }}>Interview Transcript</h2>
              <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 32 }}>Full session log with AI feedback and annotations.</p>
              
              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {(data.questions || []).map((q, i) => (
                  <Card key={q.id || i} style={{ padding: 24 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                      <h3>Question {q.sequence_num}</h3>
                      <Tag color={q.technical_score >= 80 ? 'green' : q.technical_score >= 60 ? 'amber' : 'red'}>
                        Score: {q.technical_score || 0}
                      </Tag>
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 12 }}>Topic: {q.topic}</div>
                    
                    <div style={{ display: "flex", flexDirection: "column", gap: 16, background: "var(--bg3)", padding: 20, borderRadius: "var(--radius-sm)" }}>
                      
                      {/* AI Question */}
                      <div style={{ display: "flex", gap: 12 }}>
                        <div style={{ minWidth: 60, color: "var(--text3)", fontFamily: "DM Mono, monospace", fontSize: 11, paddingTop: 2 }}>AI</div>
                        <div style={{ color: "var(--text2)", lineHeight: 1.7 }}>{q.question_text}</div>
                      </div>

                      {/* User Answer */}
                      {q.answer_text && (
                        <div style={{ display: "flex", gap: 12 }}>
                          <div style={{ minWidth: 60, color: "var(--accent-2)", fontFamily: "DM Mono, monospace", fontSize: 11, paddingTop: 2 }}>You</div>
                          <div style={{ color: "var(--text)", lineHeight: 1.7 }}>{q.answer_text}</div>
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'gaps' && (
            <div className="appear">
              <h2 style={{ fontFamily: "DM Serif Display, serif", fontSize: 30, letterSpacing: "-0.5px", marginBottom: 8 }}>Knowledge Gaps</h2>
              <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 32 }}>Areas identified from interview responses vs job description requirements.</p>

              {data.knowledgeGaps?.length > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {data.knowledgeGaps.map((gap, i) => (
                    <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: 20 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <span style={{ fontSize: 16, fontWeight: 500 }}>{gap.topic}</span>
                        <Tag color={gap.severity === "high" ? "red" : gap.severity === "medium" ? "amber" : "green"}>{gap.severity}</Tag>
                      </div>
                      <div style={{ height: 4, background: "var(--bg4)", borderRadius: 2, overflow: "hidden", marginBottom: 12 }}>
                        <div style={{ width: `${gap.score}%`, height: "100%", borderRadius: 2, background: gap.severity === "high" ? "var(--red)" : gap.severity === "medium" ? "var(--amber)" : "var(--green)" }} />
                      </div>
                      <div style={{ fontSize: 14, color: "var(--text2)", lineHeight: 1.6 }}>{gap.suggestion}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <Card style={{ padding: 32, textAlign: "center", color: "var(--text2)" }}>
                  No significant knowledge gaps identified in this session.
                </Card>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
