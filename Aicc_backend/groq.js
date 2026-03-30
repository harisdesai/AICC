"use strict";
const Groq = require("groq-sdk");
const { retrieveContext } = require("./rag");

const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

let groqClient;
function getGroq() {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    const e = new Error("GROQ_API_KEY is not set in server .env");
    e.code = "GROQ_CONFIG";
    throw e;
  }
  if (!groqClient) groqClient = new Groq({ apiKey: key });
  return groqClient;
}

// Interview question topics mapped to roles
const TOPIC_MAP = {
  "Backend Engineer": ["System Design", "Databases", "APIs & Web", "Distributed Systems", "Concurrency", "Behavioral"],
  "ML Engineer": ["Machine Learning", "Deep Learning", "MLOps", "Python & Data", "System Design", "Behavioral"],
  "Full Stack": ["Frontend", "Backend", "Databases", "APIs & Web", "DevOps", "Behavioral"],
  "DevOps / SRE": ["Linux & Networking", "CI/CD", "Kubernetes", "Monitoring & SLOs", "Incident Response", "Behavioral"],
  "Data Scientist": ["Statistics", "Machine Learning", "SQL & Data Wrangling", "Python", "Visualization", "Behavioral"],
};

function getTopicsForRole(role) {
  for (const [key, topics] of Object.entries(TOPIC_MAP)) {
    if (role.toLowerCase().includes(key.toLowerCase())) return topics;
  }
  return ["Technical Skills", "Problem Solving", "System Design", "Communication", "Teamwork", "Behavioral"];
}

async function generateFirstQuestion(sessionContext) {
  const { targetRole, resumeJson, userName } = sessionContext;
  const topics = getTopicsForRole(targetRole);
  const firstTopic = topics[0];

  const expStr = (resumeJson?.experience || []).map(e => `${e.role} at ${e.company} (${e.start}-${e.end})`).join(", ");
  const projStr = (resumeJson?.projects || []).map(p => p.name).join(", ");
  const prompt = `You are an expert technical interviewer at a top-tier tech company conducting a ${targetRole} interview.

Candidate: ${userName}
Skills from resume: ${(resumeJson?.skills || resumeJson?.Skills || []).slice(0, 15).join(", ")}
Experience: ${expStr}
Projects: ${projStr}
First topic to cover: ${firstTopic}

Generate ONE opening interview question. Be specific — reference their skills or background where relevant.
Be conversational and professional. Keep it to 2-3 sentences max.
Return ONLY the question text, nothing else.`;

  const groq = getGroq();
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 200,
    temperature: 0.7,
  });
  return {
    question: completion.choices[0].message.content.trim(),
    topic: firstTopic,
  };
}

async function generateFollowUpQuestion(sessionContext) {
  const { sessionId, userId, targetRole, resumeJson, conversationHistory, currentTopic, questionNumber } = sessionContext;

  // RAG: retrieve relevant context from GitHub repos / resume embeddings
  let ragContext = "";
  try {
    const lastAnswer = conversationHistory[conversationHistory.length - 1]?.content || "";
    const results = await retrieveContext(userId, lastAnswer, 3);
    if (results.length > 0) {
      ragContext = "\n\nRelevant context from candidate's GitHub repos:\n" +
        results.map(r => `- ${r.document.substring(0, 300)}`).join("\n");
    }
  } catch (err) {
    console.warn("[RAG] Context retrieval failed:", err.message);
  }

  const topics = getTopicsForRole(targetRole);
  const nextTopic = topics[Math.min(Math.floor(questionNumber / 2), topics.length - 1)];

  const expStr = (resumeJson?.experience || []).map(e => `${e.role} at ${e.company} (${e.start}-${e.end})`).join(", ");
  
  const systemPrompt = `You are an expert ${targetRole} interviewer. Your job:
1. Evaluate the candidate's last answer
2. Ask ONE targeted follow-up question that either:
   - Digs deeper into what they just said, OR
   - Transitions to a new topic: ${nextTopic}
3. If they mentioned a specific tool/project, reference it by name
4. Be concise — 2-3 sentences max
5. Return ONLY the question text
Candidate Experience: ${expStr}
${ragContext}`;

  const groq = getGroq();
  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-6), // Last 3 exchanges for context
    ],
    max_tokens: 250,
    temperature: 0.65,
  });

  return {
    question: completion.choices[0].message.content.trim(),
    topic: nextTopic,
  };
}

async function evaluateAnswer(question, answer, topic, targetRole) {
  if (!answer || answer.trim().length < 10) {
    return { score: 0, feedback: "No substantive answer provided.", fillerWords: [] };
  }

  const FILLERS = ["um", "uh", "like", "basically", "literally", "you know", "sort of", "kind of", "right", "so"];
  const lowerAnswer = answer.toLowerCase();
  const fillerCounts = {};
  for (const f of FILLERS) {
    const regex = new RegExp(`\\b${f}\\b`, "gi");
    const matches = lowerAnswer.match(regex);
    if (matches) fillerCounts[f] = matches.length;
  }
  const totalFillers = Object.values(fillerCounts).reduce((a, b) => a + b, 0);

  const words = answer.trim().split(/\s+/).length;
  // Estimate WPM assuming avg ~2 min answer
  const estimatedWpm = Math.round(words / 2);

  const prompt = `You are evaluating a ${targetRole} interview answer.

Question: ${question}
Topic: ${topic}
Answer: ${answer}

Score the answer 0-100 on technical accuracy and completeness.
Then provide 2-3 sentences of specific, actionable feedback.

Return ONLY valid JSON:
{
  "score": <number 0-100>,
  "feedback": "<2-3 sentences of specific feedback>",
  "strengths": ["<strength 1>", "<strength 2>"],
  "gaps": ["<gap 1>"]
}`;

  try {
    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 400,
      temperature: 0.3,
    });
    let raw = completion.choices[0].message.content.trim();
    raw = raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    const parsed = JSON.parse(raw);
    return {
      score: Math.min(100, Math.max(0, parsed.score)),
      feedback: parsed.feedback,
      strengths: parsed.strengths || [],
      gaps: parsed.gaps || [],
      fillerWords: fillerCounts,
      fillerCount: totalFillers,
      wordCount: words,
      estimatedWpm,
    };
  } catch (err) {
    console.error("[Groq] Evaluation failed:", err.message);
    return { score: 50, feedback: "Answer received.", fillerWords: fillerCounts, fillerCount: totalFillers, wordCount: words, estimatedWpm };
  }
}

async function generateKnowledgeGaps(sessionId, targetRole, qaLog) {
  if (!qaLog || qaLog.length === 0) return [];

  const qaText = qaLog.map(q =>
    `Q: ${q.question_text}\nA: ${q.answer_text || "(no answer)"}\nScore: ${q.technical_score || 0}`
  ).join("\n\n");

  const prompt = `Based on this ${targetRole} interview transcript, identify knowledge gaps.

${qaText}

Return ONLY valid JSON array (no markdown):
[
  {
    "topic": "<specific topic name>",
    "score": <0-100, how well candidate knows this>,
    "severity": "high|medium|low",
    "suggestion": "<1-2 sentence study recommendation>"
  }
]
Identify 4-6 distinct gaps. Order by severity (high first).`;

  try {
    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    });
    let raw = completion.choices[0].message.content.trim();
    raw = raw.substring(raw.indexOf('['), raw.lastIndexOf(']') + 1);
    return JSON.parse(raw);
  } catch (err) {
    console.error("[Groq] Gap analysis failed:", err.message);
    return [];
  }
}

async function generateResumeReview(resumeJson) {
  if (!resumeJson || Object.keys(resumeJson).length === 0) {
    return { score: 0, strengths: [], improvements: ["No resume data found"], missingKeywords: [] };
  }

  const prompt = `You are a brutal, highly strict technical recruiter and a literal ATS logic parser. 
Review the following resume data:
${JSON.stringify({
  skills: resumeJson.skills,
  experience: resumeJson.experience,
  projects: resumeJson.projects,
  education: resumeJson.education,
  summary: resumeJson.summary
}, null, 2)}

Evaluate this strictly against modern FAANG metrics. The industry average ATS matches at ~35-45. Only grant >70 if the resume has massive quantifiable impact formatting and elite context. Actively deduct points for fluff, bad action verbs, and missing metrics.
Provide a detailed structured JSON response. Identify at least 3 strengths, 3 actionable formatting/content improvements, and a few missing critical keywords (if any).
Also include an array of 'bullet_critiques' where you extract 3 weak bullets and rewrite them to be mathematically dense.
Output ONLY valid JSON:
{
  "score": <0-100 STRICT ATS readability and impact score>,
  "strengths": ["<strength 1>", "<strength 2>"],
  "improvements": ["<actionable improvement 1>", "<actionable improvement 2>"],
  "missingKeywords": ["<keyword 1>", "<keyword 2>"],
  "bullet_critiques": [
    { "original": "<weak text>", "rewrite": "<optimized with metrics action-verb>", "reason": "<why it failed the ATS logic>" }
  ]
}`;

  try {
    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 600,
      temperature: 0.3,
    });
    let raw = completion.choices[0].message.content.trim();
    raw = raw.substring(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
    return JSON.parse(raw);
  } catch (err) {
    console.error("[Groq] Resume review failed:", err.message);
    return { score: 50, strengths: [], improvements: ["Review service unavailable"], missingKeywords: [] };
  }
}

module.exports = { generateFirstQuestion, generateFollowUpQuestion, evaluateAnswer, generateKnowledgeGaps, getTopicsForRole, generateResumeReview };
