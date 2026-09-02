// middleware/auth.js
const jwt = require("jsonwebtoken");
const { readDB } = require("../db");

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or malformed Authorization header. Expected: Bearer <token>" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }
}

async function requireVerifiedAdmin(req, res, next) {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only college admins can do this." });
    }

    const db = await readDB();
    const user = db.users.find((u) => u.id === req.user.id);

    if (!user || !user.is_verified) {
      return res.status(403).json({ error: "Your admin account isn't verified yet." });
    }

    next();
  } catch (err) {
    console.error("requireVerifiedAdmin error:", err);
    res.status(500).json({ error: "Something went wrong checking your verification status." });
  }
}

module.exports = { verifyToken, requireVerifiedAdmin };