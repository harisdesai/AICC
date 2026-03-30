import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../lib/api";
import { Button, Card, ScoreRing, Spinner, Tag } from "../components/ui";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";

export default function ReportPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

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

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "32px 24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
          <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 26 }}>Session report</div>
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>← Dashboard</Button>
        </div>

        <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 28 }}>
          <Card style={{ padding: 28, display: "flex", alignItems: "center", gap: 24 }}>
            <ScoreRing score={Math.round(data.overallScore || 0)} size={100} />
            <div>
              <Tag color="accent" style={{ marginBottom: 8 }}>{data.session?.target_role}</Tag>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>Overall blend: 70% technical, 30% delivery</div>
            </div>
          </Card>
          <Card style={{ flex: 1, minWidth: 280, padding: 16, height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="var(--border2)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: "var(--text2)", fontSize: 12 }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: "var(--text3)", fontSize: 10 }} />
                <Radar name="Score" dataKey="score" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.35} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>
          
          <Card style={{ flex: 1, minWidth: 280, padding: 24, height: 260 }}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Emotional Composure</div>
            {data.emotions && data.emotions.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {data.emotions.map((e, i) => {
                  const total = data.emotions.reduce((acc, curr) => acc + parseInt(curr.count, 10), 0);
                  const pct = Math.round((parseInt(e.count, 10) / total) * 100);
                  return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 70, fontSize: 13, color: "var(--text2)", textTransform: "capitalize" }}>{e.dominant}</div>
                      <div style={{ flex: 1, height: 8, background: "var(--border)", borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, height: "100%", background: i === 0 ? "var(--indigo)" : "var(--accent)" }} />
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

        {data.knowledgeGaps?.length > 0 && (
          <Card style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>Knowledge gaps</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {data.knowledgeGaps.map((gap, i) => (
                <div key={i} style={{ borderBottom: i < data.knowledgeGaps.length - 1 ? "1px solid var(--border)" : "none", paddingBottom: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6 }}>
                    <strong>{gap.topic}</strong>
                    <Tag color={gap.severity === "high" ? "red" : gap.severity === "medium" ? "amber" : "default"}>{gap.severity}</Tag>
                    <span style={{ color: "var(--text3)", fontSize: 13 }}>{gap.score}/100</span>
                  </div>
                  <p style={{ fontSize: 14, color: "var(--text2)" }}>{gap.suggestion}</p>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Q&A</div>
          {(data.questions || []).map((q, i) => (
            <div key={q.id || i} style={{ marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, color: "var(--text3)" }}>Q{q.sequence_num} · {q.topic}</div>
              <p style={{ marginTop: 6 }}>{q.question_text}</p>
              {q.answer_text && <p style={{ marginTop: 8, color: "var(--text2)", fontSize: 14 }}>{q.answer_text}</p>}
              {q.technical_score != null && <div style={{ marginTop: 8, fontSize: 13, color: "var(--green)" }}>Score: {q.technical_score}</div>}
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
