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

const CANDIDATE_MODELS = [
  process.env.GEMINI_MODEL,
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-flash-latest",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
].filter(Boolean);

/**
 * Reads a PDF file, submits it along with a parsing schema to Gemini, and returns parsed JSON.
 * 
 * @param {string} filePath - Absolute path to the uploaded resume PDF
 * @returns {Promise<Object>} Formatted JSON payload containing structured resume details
 */
async function parseResumeWithGemini(filePath) {
  const client = getClient();
  const fileData = fs.readFileSync(filePath);
  const base64Data = fileData.toString("base64");

  let lastError = null;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
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
      const cleaned = responseText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
      const parsed = JSON.parse(cleaned);

      console.log(`[Gemini] Parsed resume using ${modelName}: ${parsed.name}, ${(parsed.skills || []).length} skills`);
      return parsed;
    } catch (err) {
      lastError = err;
      const isUnavailable = err.message && (
        err.message.includes("404") ||
        err.message.includes("not found") ||
        err.message.includes("no longer available") ||
        err.message.includes("503") ||
        err.message.includes("Service Unavailable") ||
        err.message.includes("high demand")
      );
      if (isUnavailable) {
        console.warn(`[Gemini] Model ${modelName} unavailable, attempting fallback...`);
        continue;
      }
      break;
    }
  }
  
  const err = lastError;
  if (err && err.message && (err.message.includes("CONSUMER_SUSPENDED") || err.message.includes("403 Forbidden"))) {
    console.warn("[Gemini] API Key or project suspended by Google AI Studio (CONSUMER_SUSPENDED). Falling back to Groq...");
  } else if (err) {
    console.error("[Gemini] Resume parsing failed:", err.message);
  }
  if (err) throw err;
}

/**
 * Transcribes audio using Google Generative AI (Gemini multimodal audio capability).
 * 
 * @param {string} filePath - Absolute path to audio file on disk
 * @param {string} [mimeType="audio/webm"] - Mime type of the audio
 * @returns {Promise<string>} Transcribed speech text
 */
async function transcribeAudioWithGemini(filePath, mimeType = "audio/webm") {
  const client = getClient();

  // Clean mimeType by removing parameters like ';codecs=opus'
  let cleanMimeType = (mimeType || "").split(";")[0].trim().toLowerCase();
  if (!cleanMimeType || cleanMimeType === "application/octet-stream") {
    const ext = path.extname(filePath).toLowerCase();
    if (ext === ".wav") cleanMimeType = "audio/wav";
    else if (ext === ".mp3") cleanMimeType = "audio/mp3";
    else if (ext === ".ogg") cleanMimeType = "audio/ogg";
    else cleanMimeType = "audio/webm";
  }

  const fileData = fs.readFileSync(filePath);
  const base64Data = fileData.toString("base64");

  let lastError = null;
  for (const modelName of CANDIDATE_MODELS) {
    try {
      const model = client.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: cleanMimeType,
            data: base64Data,
          },
        },
        {
          text: "Generate an accurate transcription of the spoken audio. Output ONLY the plain text transcription, with no additional commentary, conversational remarks, or markdown formatting. If the audio is silent or contains no discernible speech, return an empty string.",
        },
      ]);

      const transcript = result.response.text().trim();
      console.log(`[Gemini STT] Transcription completed using ${modelName} (${transcript.length} chars)`);
      return transcript;
    } catch (err) {
      lastError = err;
      const isUnavailable = err.message && (
        err.message.includes("404") ||
        err.message.includes("not found") ||
        err.message.includes("no longer available") ||
        err.message.includes("503") ||
        err.message.includes("Service Unavailable") ||
        err.message.includes("high demand")
      );
      if (isUnavailable) {
        console.warn(`[Gemini STT] Model ${modelName} unavailable, attempting fallback...`);
        continue;
      }
      break;
    }
  }

  console.error("[Gemini STT] Transcription failed across candidate models:", lastError?.message);
  throw lastError;
}

module.exports = { parseResumeWithGemini, transcribeAudioWithGemini };
