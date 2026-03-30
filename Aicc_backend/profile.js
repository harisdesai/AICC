"use strict";
const express = require("express");
const { z } = require("zod");
const { authenticate } = require("../middleware/auth");
const { query } = require("../db/connection");

const router = express.Router();

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  githubUrl: z.string().url().optional().or(z.literal("")),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
});

// GET /api/profile
router.get("/", authenticate, async (req, res, next) => {
  try {
    const user = await query(
      "SELECT id, name, email, github_url, linkedin_url, created_at FROM users WHERE id = $1",
      [req.user.id]
    );
    const resumes = await query(
      "SELECT id, filename, skills, created_at FROM resumes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5",
      [req.user.id]
    );
    const stats = await query(
      `SELECT COUNT(*) as total_sessions,
              ROUND(AVG(overall_score)::numeric, 1) as avg_score,
              MAX(overall_score) as best_score
       FROM interview_sessions WHERE user_id = $1 AND status = 'completed'`,
      [req.user.id]
    );
    const repos = await query(
      "SELECT repo_name, repo_url, description, languages, stars FROM github_repos WHERE user_id = $1 ORDER BY stars DESC LIMIT 10",
      [req.user.id]
    );
    res.json({
      user: user.rows[0],
      resumes: resumes.rows,
      stats: stats.rows[0],
      repos: repos.rows,
    });
  } catch (err) { next(err); }
});

// PATCH /api/profile
router.patch("/", authenticate, async (req, res, next) => {
  try {
    const data = updateSchema.parse(req.body);
    const fields = [];
    const values = [];
    let idx = 1;
    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.githubUrl !== undefined) { fields.push(`github_url = $${idx++}`); values.push(data.githubUrl); }
    if (data.linkedinUrl !== undefined) { fields.push(`linkedin_url = $${idx++}`); values.push(data.linkedinUrl); }
    if (fields.length === 0) return res.status(400).json({ error: "No fields to update" });
    values.push(req.user.id);
    const result = await query(
      `UPDATE users SET ${fields.join(", ")} WHERE id = $${idx} RETURNING id, name, email, github_url, linkedin_url`,
      values
    );
    res.json({ user: result.rows[0] });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: "Validation failed", details: err.errors });
    next(err);
  }
});

module.exports = router;
