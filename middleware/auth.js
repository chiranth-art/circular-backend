// middleware/auth.js

const jwt = require("jsonwebtoken");
const { query } = require("../db");

const JWT_SECRET =
  process.env.JWT_SECRET || "dev-secret-change-this";

// ============================================================
// VERIFY JWT
// ============================================================

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error:
        "Missing or malformed Authorization header. Expected: Bearer <token>",
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    req.user = decoded;

    next();
  } catch (err) {
    console.error("JWT verification error:", err);

    return res.status(401).json({
      error: "Invalid or expired token.",
    });
  }
}

// ============================================================
// REQUIRE VERIFIED COLLEGE ADMIN
// ============================================================

async function requireVerifiedAdmin(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    const result = await query(
      `
      SELECT
        id,
        full_name,
        email,
        role,
        college_id,
        club_name,
        designation,
        is_verified
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(403).json({
        error: "User account not found.",
      });
    }

    const user = result.rows[0];

    if (user.role !== "admin") {
      return res.status(403).json({
        error: "Only college admins can access this resource.",
      });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        error: "Your admin account isn't verified yet.",
      });
    }

    // Store fresh database user information.
    // This is safer than relying only on JWT data.
    req.admin = user;

    next();
  } catch (err) {
    console.error("requireVerifiedAdmin error:", err);

    return res.status(500).json({
      error: "Something went wrong checking admin authorization.",
    });
  }
}

module.exports = {
  verifyToken,
  requireVerifiedAdmin,
};