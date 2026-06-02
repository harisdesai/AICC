"use strict";
/**
 * RAG (Retrieval-Augmented Generation) Service Layer
 * 
 * This service manages the repository documentation chunking and search pipeline.
 * It is responsible for:
 * 1. Synchronizing user GitHub repositories with ChromaDB vector store.
 * 2. Splitting README content into overlapping blocks for high-granularity searches.
 * 3. Embedding and storing repository chunks with custom metadata scopes.
 * 4. Querying local vector stores to retrieve context matching the candidate's conversation.
 */

const axios = require("axios");
const { ChromaClient } = require("chromadb");
const { query } = require("../db/connection");

let chromaClient;

/**
 * Lazy initializer for ChromaDB client connectivity.
 * 
 * @returns {ChromaClient} Connected Chroma client instance
 */
function getChroma() {
  if (!chromaClient) chromaClient = new ChromaClient({ path: process.env.CHROMA_URL || "http://localhost:8000" });
  return chromaClient;
}

// ChromaDB collection identifier for repository index
const COLLECTION_NAME = "aicc_repo_chunks";

// Maximum length of characters per text snippet
const CHUNK_SIZE = 500;

/**
 * Splits input text into smaller, linear chunks for embeddings representation.
 * 
 * @param {string} text - Raw text to split
 * @param {number} size - Target segment character size limit
 * @returns {string[]} Array of sliced string pieces
 */
function chunkText(text, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk.length > 50) chunks.push(chunk);
  }
  return chunks;
}

/**
 * Safely fetches or registers the primary vector collection in ChromaDB.
 * Uses Cosine Similarity space calculation metrics.
 * 
 * @returns {Promise<Collection>} ChromaDB collection reference
 */
async function getOrCreateCollection() {
  const chroma = getChroma();
  return chroma.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { "hnsw:space": "cosine" },
  });
}

/**
 * Pulls a candidate's public repositories from the GitHub REST API.
 * Reads README data, chunks contents, and persists data to PostgreSQL and ChromaDB.
 * 
 * @param {string} userId - User UUID
 * @param {string} githubUrl - Target candidate's GitHub profile link
 * @returns {Promise<Object>} Summary counts of indexing actions
 */
async function indexGithubRepos(userId, githubUrl) {
  try {
    // Extract username from URL
    const match = githubUrl.match(/github\.com\/([^/]+)/);
    if (!match) throw new Error("Invalid GitHub URL");
    const username = match[1];

    console.log(`[RAG] Fetching repos for ${username}`);

    // Clear old repos and vector search chunks for this user to avoid duplicate or stale reports
    await query("DELETE FROM github_repos WHERE user_id = $1", [userId]);
    
    let collection = null;
    try {
      collection = await getOrCreateCollection();
      await collection.delete({ where: { userId: userId } });
      console.log(`[RAG] Cleared existing ChromaDB chunks for user ${userId}`);
    } catch (e) {
      console.warn("[RAG] ChromaDB not available, skipping vector index cleanup:", e.message);
    }

    // Fetch public repos from GitHub API
    const reposResp = await axios.get(
      `https://api.github.com/users/${username}/repos?per_page=30&sort=updated`,
      { headers: { Accept: "application/vnd.github.v3+json" }, timeout: 10000 }
    );

    const repos = reposResp.data.slice(0, 15); // Top 15
    const documents = [];
    const ids = [];
    const metadatas = [];

    for (const repo of repos) {
      // Store repo record in DB
      const langs = {};
      try {
        const langResp = await axios.get(repo.languages_url, { timeout: 5000 });
        Object.assign(langs, langResp.data);
      } catch (_) {}

      let readmeText = "";
      try {
        const readmeResp = await axios.get(
          `https://api.github.com/repos/${username}/${repo.name}/readme`,
          { headers: { Accept: "application/vnd.github.v3.raw" }, timeout: 5000 }
        );
        readmeText = readmeResp.data?.substring(0, 8000) || "";
      } catch (_) {}

      await query(
        `INSERT INTO github_repos (user_id, repo_name, repo_url, description, readme_text, languages, stars)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, repo_name) DO NOTHING`,
        [userId, repo.name, repo.html_url, repo.description || "", readmeText, JSON.stringify(langs), repo.stargazers_count]
      );

      // Chunk README for vector store
      if (readmeText) {
        const chunks = chunkText(`[${repo.name}] ${repo.description || ""}\n${readmeText}`);
        chunks.forEach((chunk, i) => {
          const id = `${userId}_${repo.name}_${i}`;
          documents.push(chunk);
          ids.push(id);
          metadatas.push({ userId, repoName: repo.name, chunkIndex: i });
        });
      }
    }

    if (collection && documents.length > 0) {
      try {
        // ChromaDB upsert in batches of 100
        for (let i = 0; i < documents.length; i += 100) {
          await collection.upsert({
            documents: documents.slice(i, i + 100),
            ids: ids.slice(i, i + 100),
            metadatas: metadatas.slice(i, i + 100),
          });
        }
        console.log(`[RAG] Indexed ${repos.length} repos, ${documents.length} chunks for user ${userId} in ChromaDB`);
      } catch (e) {
        console.warn("[RAG] Failed to upsert chunks into ChromaDB:", e.message);
      }
    } else {
      console.log(`[RAG] Indexed ${repos.length} repos in PostgreSQL (ChromaDB skipped/empty)`);
    }

    return { reposIndexed: repos.length, chunksIndexed: collection ? documents.length : 0 };
  } catch (err) {
    console.error("[RAG] Indexing error:", err.message);
    throw err;
  }
}

/**
 * Searches the user's vector embeddings index for documents matching the query parameter.
 * 
 * @param {string} userId - User UUID
 * @param {string} queryText - User's verbal/written answer text
 * @param {number} nResults - Number of matched context snippets to return
 * @returns {Promise<Array>} Array of matching contexts with distances and metadata
 */
async function retrieveContext(userId, queryText, nResults = 3) {
  try {
    const collection = await getOrCreateCollection();
    const results = await collection.query({
      queryTexts: [queryText],
      nResults,
      where: { userId },
    });
    if (!results.documents?.[0]) return [];
    return results.documents[0].map((doc, i) => ({
      document: doc,
      metadata: results.metadatas?.[0]?.[i] || {},
      distance: results.distances?.[0]?.[i] || 0,
    }));
  } catch (err) {
    console.warn("[RAG] Retrieval error:", err.message);
    return [];
  }
}

module.exports = { indexGithubRepos, retrieveContext };
