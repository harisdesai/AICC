"use strict";
const axios = require("axios");
const { ChromaClient } = require("chromadb");
const { query } = require("../db/connection");

let chromaClient;
function getChroma() {
  if (!chromaClient) chromaClient = new ChromaClient({ path: process.env.CHROMA_URL || "http://localhost:8000" });
  return chromaClient;
}

const COLLECTION_NAME = "aicc_repo_chunks";
const CHUNK_SIZE = 500; // chars

function chunkText(text, size = CHUNK_SIZE) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) {
    const chunk = text.slice(i, i + size).trim();
    if (chunk.length > 50) chunks.push(chunk);
  }
  return chunks;
}

async function getOrCreateCollection() {
  const chroma = getChroma();
  return chroma.getOrCreateCollection({
    name: COLLECTION_NAME,
    metadata: { "hnsw:space": "cosine" },
  });
}

async function indexGithubRepos(userId, githubUrl) {
  try {
    // Extract username from URL
    const match = githubUrl.match(/github\.com\/([^/]+)/);
    if (!match) throw new Error("Invalid GitHub URL");
    const username = match[1];

    console.log(`[RAG] Fetching repos for ${username}`);

    // Fetch public repos from GitHub API
    const reposResp = await axios.get(
      `https://api.github.com/users/${username}/repos?per_page=30&sort=updated`,
      { headers: { Accept: "application/vnd.github.v3+json" }, timeout: 10000 }
    );

    const repos = reposResp.data.slice(0, 15); // Top 15
    const collection = await getOrCreateCollection();
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

    if (documents.length > 0) {
      // ChromaDB upsert in batches of 100
      for (let i = 0; i < documents.length; i += 100) {
        await collection.upsert({
          documents: documents.slice(i, i + 100),
          ids: ids.slice(i, i + 100),
          metadatas: metadatas.slice(i, i + 100),
        });
      }
    }

    console.log(`[RAG] Indexed ${repos.length} repos, ${documents.length} chunks for user ${userId}`);
    return { reposIndexed: repos.length, chunksIndexed: documents.length };
  } catch (err) {
    console.error("[RAG] Indexing error:", err.message);
    throw err;
  }
}

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
