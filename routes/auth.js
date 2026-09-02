// routes/auth.js
// Authentication routes using PostgreSQL

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "dev-secret-change-this";

// ---------------------------------------------------------------
// POST /auth/signup/student
// ---------------------------------------------------------------
router.post("/signup/student", async (req, res) => {
  try {
    const { full_name, email, password, college_id, branch, year } = req.body;

    if (!full_name || !email || !password) {
      return res.status(400).json({
        error: "full_name, email, and password are required."
      });
    }

    // Check whether email already exists
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    // Never store plain password
    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `
      INSERT INTO users
        (full_name, email, password_hash, role, college_id,
         branch, year, is_verified, created_at)
      VALUES
        ($1, $2, $3, 'student', $4, $5, $6, true, NOW())
      RETURNING id
      `,
      [
        full_name,
        email,
        password_hash,
        college_id || null,
        branch || null,
        year || null
      ]
      
    );

    res.status(201).json({
      message: "Student account created.",
      user_id: result.rows[0].id
    });

  } catch (error) {
    console.error("Student signup error:", error);

    res.status(500).json({
      error: "Server error while creating student account."
    });
  }
});


// ---------------------------------------------------------------
// POST /auth/signup/admin
// ---------------------------------------------------------------
router.post("/signup/admin", async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      college_id,
      club_name,
      designation
    } = req.body;

    if (
      !full_name ||
      !email ||
      !password ||
      !college_id ||
      !club_name
    ) {
      return res.status(400).json({
        error:
          "full_name, email, password, college_id, and club_name are required."
      });
    }

    // Check existing email
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE LOWER(email) = LOWER($1)",
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: "An account with this email already exists."
      });
    }

    // Find college
    const collegeResult = await pool.query(
      "SELECT * FROM colleges WHERE id = $1",
      [college_id]
    );

    if (collegeResult.rows.length === 0) {
      return res.status(400).json({
        error:
          "Invalid college_id. Call GET /colleges to see valid options."
      });
    }

    const college = collegeResult.rows[0];

    const password_hash = await bcrypt.hash(password, 10);

    // Check email domain
    const emailDomain = email.split("@")[1]?.toLowerCase();

    const autoVerified =
      emailDomain === college.domain.toLowerCase();

    // Create admin
    const userResult = await pool.query(
      `
      INSERT INTO users
        (full_name, email, password_hash, role, college_id,
         club_name, designation, is_verified, created_at)
      VALUES
        ($1, $2, $3, 'admin', $4, $5, $6, $7, NOW())
      RETURNING id
      `,
      [
        full_name,
        email,
        password_hash,
        college_id,
        club_name,
        designation || null,
        autoVerified
      ]
    );

    const userId = userResult.rows[0].id;

    // If not automatically verified,
    // create a verification request.
    if (!autoVerified) {
      await pool.query(
        `
        INSERT INTO verification_requests
          (user_id, status, created_at)
        VALUES
          ($1, 'pending', NOW())
        `,
        [userId]
      );
    }

    res.status(201).json({
      message: autoVerified
        ? "Admin account created and auto-verified (email domain matched college)."
        : "Admin account created. Awaiting manual verification since the email domain didn't match your college's registered domain.",
      user_id: userId,
      is_verified: autoVerified
    });

  } catch (error) {
    console.error("Admin signup error:", error);

    res.status(500).json({
      error: "Server error while creating admin account."
    });
  }
});


// ---------------------------------------------------------------
// POST /auth/login
// ---------------------------------------------------------------
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "email and password are required."
      });
    }

    // Find user in PostgreSQL
    const result = await pool.query(
      `
      SELECT *
      FROM users
      WHERE LOWER(email) = LOWER($1)
      `,
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    const user = result.rows[0];

    // Check password
    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password."
      });
    }

    // Unverified admin cannot login
    if (user.role === "admin" && !user.is_verified) {
      return res.status(403).json({
        error:
          "Your admin account is still pending verification."
      });
    }

    // Create JWT
    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        college_id: user.college_id
      },
      JWT_SECRET,
      {
        expiresIn: "7d"
      }
    );

    res.json({
      token,
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        college_id: user.college_id
      }
    });

  } catch (error) {
    console.error("Login error:", error);

    res.status(500).json({
      error: "Server error while logging in."
    });
  }
});


module.exports = router;