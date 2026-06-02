"use strict";
/**
 * Fallback Resume Parser Service Layer
 * 
 * Invoked if the primary Gemini parsing pipeline fails.
 * Implements a tiered extraction strategy to obtain text from uploads:
 * Tier 1: Parse binary using standard 'pdf-parse' package.
 * Tier 2: Check if document is plain text (by testing for '%PDF-' headers) and read directly.
 * Tier 3: Recover printable ASCII sequences from corrupted PDF data streams.
 * Once text is extracted, uses Groq SDK completions to map unstructured text to the JSON schema.
 */

const fs = require("fs");
const pdfParse = require("pdf-parse");
const Groq = require("groq-sdk");

// LLM Model mapping
const GROQ_MODEL = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

/**
 * Extracts and structures resume profiles from files.
 * 
 * @param {string} filePath - Path to file
 * @returns {Promise<Object>} Structured JSON representation of resume
 */
async function parseResumeWithGroq(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  
  let rawText = "";
  try {
    // Tier 1: Try reading via standard PDF libraries
    const data = await pdfParse(fileBuffer);
    rawText = data.text || "";
  } catch (pdfErr) {
    console.warn("[ParserFallback] pdf-parse failed:", pdfErr.message);
    
    // Check if it is a plain text file (does not start with %PDF- header)
    const fileHeader = fileBuffer.toString("utf8", 0, 5);
    if (fileHeader !== "%PDF-") {
      // Tier 2: Read plain text formats
      console.log("[ParserFallback] File does not start with %PDF-. Parsing as plain text.");
      rawText = fileBuffer.toString("utf8");
    } else {
      // Tier 3: Parse printable ASCII strings from corrupt PDF files
      console.log("[ParserFallback] File is a corrupted PDF. Attempting strings-extraction fallback...");
      const asciiStrings = [];
      const regex = /[\x20-\x7E\s]{4,}/g; // Printable ASCII strings of length 4+
      let match;
      const fileString = fileBuffer.toString("binary");
      while ((match = regex.exec(fileString)) !== null) {
        // Strip excessive whitespace sequences within the match
        const cleanStr = match[0].replace(/\s+/g, " ").trim();
        if (cleanStr.length >= 4) {
          asciiStrings.push(cleanStr);
        }
      }
      rawText = asciiStrings.join("\n");
    }
  }

  // Reject files from which no text could be recovered
  if (!rawText.trim()) {
    throw new Error("Could not extract any readable text from the uploaded file.");
  }

  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) {
    throw new Error("GROQ_API_KEY is not set in server .env");
  }
  const groq = new Groq({ apiKey: key });

  // Prompt configuration specifying JSON formats
  const prompt = `You are a resume parser. Extract ALL information from the resume raw text and return ONLY valid JSON.
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

Resume Text:
${rawText}
`;

  const completion = await groq.chat.completions.create({
    model: GROQ_MODEL,
    messages: [{ role: "user", content: prompt }],
    max_tokens: 2000,
    temperature: 0.1,
  });

  let responseText = completion.choices[0].message.content.trim();
  
  // Safely extract substring containing JSON delimiters to bypass system pre-texts
  const firstBrace = responseText.indexOf('{');
  const lastBrace = responseText.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("Groq response did not contain a valid JSON object.");
  }
  const cleaned = responseText.substring(firstBrace, lastBrace + 1);
  const parsed = JSON.parse(cleaned);

  // Ensure raw_text field remains populated
  parsed.raw_text = parsed.raw_text || rawText.substring(0, 10000);

  return parsed;
}

module.exports = { parseResumeWithGroq };
