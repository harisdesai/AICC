"use strict";
const jwt = require("jsonwebtoken");

function authenticate(req, res, next) {
  const h = req.headers.authorization;
  const token = h?.startsWith("Bearer ") ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: String(payload.sub), name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

module.exports = { authenticate };
