"use strict";
const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI;
function getClient() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set in server .env (Google AI Studio)");
  }
  if (!genAI) genAI = new GoogleGenerativeAI(key);
  return genAI;
}

const RESUME_PARSE_PROMPT = `
You are a resume parser. Extract ALL information from the resume PDF and return ONLY valid JSON.
No markdown, no explanation — just the JSON object.

Required schema:
{
  "name": "string",
  "email": "string",
  "phone": "string or null",
  "location": "string or null",
  "summary": "string or null",
  "skills": ["array of skill strings"],
  "experience": [
    {
      "company": "string",
      "role": "string",
      "start": "string",
      "end": "string or Present",
      "bullets": ["array of highly specific quantifiable achievement strings with extracted metric scopes"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "tech_stack": ["array of specific libraries and frameworks"],
      "github_url": "string or null",
      "quantifiable_impact": ["array of measurable impacts the project achieved"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "year": "string"
    }
  ],
  "certifications": ["array or empty array"],
  "raw_text": "full plain text of the resume"
}
`;

async function parseResumeWithGemini(filePath) {
  try {
    const client = getClient();
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const model = client.getGenerativeModel({ model: modelName });

    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString("base64");

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: "application/pdf",
          data: base64Data,
        },
      },
      { text: RESUME_PARSE_PROMPT },
    ]);

    const responseText = result.response.text().trim();
    // Strip any accidental markdown code fences
    const cleaned = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    console.log(`[Gemini] Parsed resume: ${parsed.name}, ${(parsed.skills || []).length} skills`);
    return parsed;
  } catch (err) {
    console.error("[Gemini] Resume parsing failed:", err.message);
    // Return minimal fallback so the upload doesn't fail entirely
    return {
      name: "Unknown",
      email: "",
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
      raw_text: "",
      parse_error: err.message,
    };
  }
}

module.exports = { parseResumeWithGemini };
