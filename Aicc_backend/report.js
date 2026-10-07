"use strict";
const { query } = require("../db/connection");
const { generateKnowledgeGaps } = require("./groq");

async function generateReport(sessionId) {
  const questions = await query(
    "SELECT * FROM session_questions WHERE session_id = $1 ORDER BY sequence_num",
    [sessionId]
  );
  const rows = questions.rows;
  if (rows.length === 0) return { overallScore: 0, technicalScore: 0, commScore: 0 };

  const scores = rows.map(q => Number(q.technical_score) || 0);
  const technicalScore = scores.reduce((a, b) => a + b, 0) / scores.length;

  const validWpms = rows.map(q => Number(q.answer_wpm) || 0).filter(w => w > 0);
  const avgWpm = validWpms.length ? validWpms.reduce((a, b) => a + b, 0) / validWpms.length : 135;

  // WPM pace score: ideal 120-160 (95-100), good 115-175 (78), penalise outside
  let wpmScore = 95;
  if (avgWpm < 90 || avgWpm > 210) wpmScore = 60;
  else if (avgWpm < 115 || avgWpm > 175) wpmScore = 78;
  else if (avgWpm >= 120 && avgWpm <= 160) wpmScore = 98;

  const commScore = wpmScore;
  const overallScore = technicalScore * 0.7 + commScore * 0.3;

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    technicalScore: Math.round(technicalScore * 10) / 10,
    commScore: Math.round(commScore * 10) / 10,
    avgWpm: Math.round(avgWpm),
  };
}

async function generateKnowledgeGapAnalysis(sessionId, targetRole) {
  try {
    const questions = await query(
      "SELECT question_text, answer_text, technical_score, topic FROM session_questions WHERE session_id = $1",
      [sessionId]
    );
    return generateKnowledgeGaps(sessionId, targetRole, questions.rows);
  } catch (err) {
    console.error("[Report] Gap analysis error:", err.message);
    return [];
  }
}

module.exports = { generateReport, generateKnowledgeGapAnalysis };
