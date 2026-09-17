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
const { createGroqChatCompletion, safeParseJson } = require("./groq");

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

  // Prompt configuration specifying JSON formats without echoing raw_text
  const prompt = `You are a resume parser. Extract ALL information from the resume raw text and return ONLY valid JSON.
No markdown, no explanation — just the JSON object. Do NOT include raw_text in your JSON output.

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
      "bullets": ["array of achievement strings"]
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "tech_stack": ["array of specific libraries and frameworks"],
      "github_url": "string or null",
      "quantifiable_impact": ["array of measurable impacts"]
    }
  ],
  "education": [
    {
      "institution": "string",
      "degree": "string",
      "year": "string"
    }
  ],
  "certifications": ["array or empty array"]
}

Resume Text:
${rawText.slice(0, 15000)}
`;

  const completion = await createGroqChatCompletion({
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
    max_tokens: 4096,
    temperature: 0.1,
  });

  const responseText = completion.choices[0].message.content.trim();
  const parsed = safeParseJson(responseText);

  // Ensure raw_text field remains populated with actual text from the document
  parsed.raw_text = parsed.raw_text || rawText.substring(0, 15000);

  return parsed;
}

module.exports = { parseResumeWithGroq };
