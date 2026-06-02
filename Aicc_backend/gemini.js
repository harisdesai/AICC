"use strict";
/**
 * Gemini AI Resume Parser Integration
 * 
 * Interacts with the Google Generative AI API (gemini-2.0-flash by default) to parse uploaded PDF resumes.
 * key responsibilities:
 * 1. Read files and convert binary data into base64 format payloads.
 * 2. Prompt the generative model with a structured JSON schema constraint.
 * 3. Sanitize AI markdown responses (extracting raw JSON content by stripping markdown fences).
 * 4. Parse the output into a structured candidate profile.
 */

const fs = require("fs");
const path = require("path");
const { GoogleGenerativeAI } = require("@google/generative-ai");

let genAI;

/**
 * Lazy initializer for Google Generative AI client connection.
 * Checks for API key presence in environment variables.
 * 
 * @returns {GoogleGenerativeAI} Google Generative AI SDK client
 */
function getClient() {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) {
    throw new Error("GEMINI_API_KEY is not set in server .env (Google AI Studio)");
  }
  if (!genAI) genAI = new GoogleGenerativeAI(key);
  return genAI;
}

// System prompt defining strict guidelines and JSON structure expectations for parsing
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

/**
 * Reads a PDF file, submits it along with a parsing schema to Gemini, and returns parsed JSON.
 * 
 * @param {string} filePath - Absolute path to the uploaded resume PDF
 * @returns {Promise<Object>} Formatted JSON payload containing structured resume details
 */
async function parseResumeWithGemini(filePath) {
  try {
    const client = getClient();
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const model = client.getGenerativeModel({ model: modelName });

    // Read PDF file synchronously and format into base64 payload
    const fileData = fs.readFileSync(filePath);
    const base64Data = fileData.toString("base64");

    // Query generative model passing the base64 object and schema constraints
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
    
    // Strip any accidental markdown code fences inserted by the model
    const cleaned = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
    const parsed = JSON.parse(cleaned);

    console.log(`[Gemini] Parsed resume: ${parsed.name}, ${(parsed.skills || []).length} skills`);
    return parsed;
  } catch (err) {
    console.error("[Gemini] Resume parsing failed:", err.message);
    throw err;
  }
}

module.exports = { parseResumeWithGemini };
