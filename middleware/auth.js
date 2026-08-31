// middleware/auth.js
// Middleware = code that runs BEFORE your route handler, to check
// something first. Here: is this request carrying a valid login token?

const jwt = require("jsonwebtoken");
const { readDB } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

// Use this on any route that requires the person to be logged in.
// It reads the "Authorization: Bearer <token>" header, checks the
// token is genuine, and attaches the decoded info as req.user so
// your route handler can use it (e.g. req.user.id, req.user.role).
function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization; // "Bearer eyJhbGc..."

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header. Expected: Bearer <token>" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, role, college_id }
    next(); // continue on to the actual route handler
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

// Use this AFTER verifyToken on routes only admins should reach.
// Also re-checks is_verified against the database (not just the token),
// so a token issued before someone got un-verified can't slip through.
function requireVerifiedAdmin(req, res, next) {
  if (req.user.role !== "admin") {
    return res.status(403).json({ error: "Only college admins can do this." });
  }

  const db = readDB();
  const user = db.users.find((u) => u.id === req.user.id);

  if (!user || !user.is_verified) {
    return res.status(403).json({ error: "Your admin account isn't verified yet." });
  }

  next();
}

module.exports = { verifyToken, requireVerifiedAdmin };
