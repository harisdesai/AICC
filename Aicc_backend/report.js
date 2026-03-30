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

  const avgWpm = rows.map(q => Number(q.answer_wpm) || 0).reduce((a, b) => a + b, 0) / rows.length;
  const avgFillers = rows.map(q => Number(q.filler_count) || 0).reduce((a, b) => a + b, 0) / rows.length;

  // WPM score: ideal 120-160, penalise outside
  let wpmScore = 100;
  if (avgWpm < 100 || avgWpm > 200) wpmScore = 50;
  else if (avgWpm < 120 || avgWpm > 170) wpmScore = 75;

  // Filler score: < 2/min = 100, 2-4 = 75, 4-6 = 50, >6 = 25
  let fillerScore = 100;
  if (avgFillers > 6) fillerScore = 25;
  else if (avgFillers > 4) fillerScore = 50;
  else if (avgFillers > 2) fillerScore = 75;

  const commScore = (wpmScore + fillerScore) / 2;
  const overallScore = technicalScore * 0.7 + commScore * 0.3;

  return {
    overallScore: Math.round(overallScore * 10) / 10,
    technicalScore: Math.round(technicalScore * 10) / 10,
    commScore: Math.round(commScore * 10) / 10,
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
