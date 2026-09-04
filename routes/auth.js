// routes/auth.js

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { query, readDB, writeDB } = require("../db");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET || "dev-secret-change-this";


// ============================================================
// HELPER: CREATE JWT
// ============================================================

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      college_id: user.college_id || null,
    },
    JWT_SECRET,
    {
      expiresIn: "7d",
    }
  );
}


// ============================================================
// REGISTER
// POST /auth/register
// ============================================================

router.post("/register", async (req, res) => {
  try {
    const {
      full_name,
      email,
      password,
      role,
      college_id,
      branch,
      year,
      club_name,
      designation,
    } = req.body;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!full_name || !email || !password) {
      return res.status(400).json({
        error: "Full name, email and password are required.",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: "Password must be at least 6 characters.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // --------------------------------------------------------
    // POSTGRESQL
    // --------------------------------------------------------

    if (process.env.DATABASE_URL) {
      const existingUser = await query(
        `
        SELECT id
        FROM users
        WHERE LOWER(email) = LOWER($1)
        `,
        [normalizedEmail]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          error: "An account with this email already exists.",
        });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const userRole = role || "student";

      const result = await query(
        `
        INSERT INTO users
        (
          full_name,
          email,
          password_hash,
          role,
          college_id,
          branch,
          year,
          club_name,
          designation,
          is_verified
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10
        )
        RETURNING
          id,
          full_name,
          email,
          role,
          college_id,
          branch,
          year,
          club_name,
          designation,
          is_verified,
          created_at
        `,
        [
          full_name.trim(),
          normalizedEmail,
          passwordHash,
          userRole,
          college_id ? Number(college_id) : null,
          branch || null,
          year || null,
          club_name || null,
          designation || null,

          // Students can login immediately.
          // Admins should normally be verified separately.
          userRole === "student",
        ]
      );

      const user = result.rows[0];

      const token = createToken(user);

      return res.status(201).json({
        message: "Registration successful.",
        token,
        user,
      });
    }


    // --------------------------------------------------------
    // LOCAL JSON DATABASE
    // --------------------------------------------------------

    const db = await readDB();

    const existingUser = db.users.find(
      (user) =>
        user.email.toLowerCase() === normalizedEmail
    );

    if (existingUser) {
      return res.status(409).json({
        error: "An account with this email already exists.",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newId =
      db.users.length > 0
        ? Math.max(...db.users.map((u) => Number(u.id))) + 1
        : 1;

    const userRole = role || "student";

    const newUser = {
      id: newId,
      full_name: full_name.trim(),
      email: normalizedEmail,
      password_hash: passwordHash,
      role: userRole,
      college_id: college_id
        ? Number(college_id)
        : null,
      branch: branch || null,
      year: year || null,
      club_name: club_name || null,
      designation: designation || null,
      is_verified: userRole === "student",
      created_at: new Date().toISOString(),
    };

    db.users.push(newUser);

    await writeDB(db);

    const token = createToken(newUser);

    // Never send password_hash to frontend.
    const safeUser = {
      id: newUser.id,
      full_name: newUser.full_name,
      email: newUser.email,
      role: newUser.role,
      college_id: newUser.college_id,
      branch: newUser.branch,
      year: newUser.year,
      club_name: newUser.club_name,
      designation: newUser.designation,
      is_verified: newUser.is_verified,
      created_at: newUser.created_at,
    };

    return res.status(201).json({
      message: "Registration successful.",
      token,
      user: safeUser,
    });

  } catch (err) {
    console.error("Register error:", err);

    return res.status(500).json({
      error: "Something went wrong during registration.",
      details: err.message,
    });
  }
});


// ============================================================
// LOGIN
// POST /auth/login
// ============================================================

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // --------------------------------------------------------
    // VALIDATION
    // --------------------------------------------------------

    if (!email || !password) {
      return res.status(400).json({
        error: "Email and password are required.",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();


    // ========================================================
    // POSTGRESQL
    // ========================================================

    if (process.env.DATABASE_URL) {
      const result = await query(
        `
        SELECT
          id,
          full_name,
          email,
          password_hash,
          role,
          college_id,
          branch,
          year,
          club_name,
          designation,
          is_verified,
          created_at
        FROM users
        WHERE LOWER(email) = LOWER($1)
        LIMIT 1
        `,
        [normalizedEmail]
      );

      if (result.rows.length === 0) {
        return res.status(401).json({
          error: "Invalid email or password.",
        });
      }

      const user = result.rows[0];

      const passwordMatches = await bcrypt.compare(
        password,
        user.password_hash
      );

      if (!passwordMatches) {
        return res.status(401).json({
          error: "Invalid email or password.",
        });
      }

      const token = createToken(user);

      // Remove password hash before sending response.
      delete user.password_hash;

      return res.status(200).json({
        message: "Login successful.",
        token,
        user,
      });
    }


    // ========================================================
    // LOCAL JSON DATABASE
    // ========================================================

    const db = await readDB();

    const user = db.users.find(
      (u) =>
        u.email.toLowerCase() === normalizedEmail
    );

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Invalid email or password.",
      });
    }

    const token = createToken(user);

    const safeUser = {
      id: user.id,
      full_name: user.full_name,
      email: user.email,
      role: user.role,
      college_id: user.college_id,
      branch: user.branch,
      year: user.year,
      club_name: user.club_name,
      designation: user.designation,
      is_verified: user.is_verified,
      created_at: user.created_at,
    };

    return res.status(200).json({
      message: "Login successful.",
      token,
      user: safeUser,
    });

  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      error: "Something went wrong during login.",
      details: err.message,
    });
  }
});


// ============================================================
// GET CURRENT USER
// GET /auth/me
// ============================================================

router.get("/me", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;

    if (
      !authHeader ||
      !authHeader.startsWith("Bearer ")
    ) {
      return res.status(401).json({
        error:
          "Missing or malformed Authorization header. Expected: Bearer <token>",
      });
    }

    const token = authHeader.split(" ")[1];

    let decoded;

    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({
        error: "Invalid or expired token.",
      });
    }


    // --------------------------------------------------------
    // POSTGRESQL
    // --------------------------------------------------------

    if (process.env.DATABASE_URL) {
      const result = await query(
        `
        SELECT
          id,
          full_name,
          email,
          role,
          college_id,
          branch,
          year,
          club_name,
          designation,
          is_verified,
          created_at
        FROM users
        WHERE id = $1
        `,
        [decoded.id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          error: "User not found.",
        });
      }

      return res.json({
        user: result.rows[0],
      });
    }


    // --------------------------------------------------------
    // LOCAL JSON
    // --------------------------------------------------------

    const db = await readDB();

    const user = db.users.find(
      (u) => Number(u.id) === Number(decoded.id)
    );

    if (!user) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    return res.json({
      user: {
        id: user.id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        college_id: user.college_id,
        branch: user.branch,
        year: user.year,
        club_name: user.club_name,
        designation: user.designation,
        is_verified: user.is_verified,
        created_at: user.created_at,
      },
    });

  } catch (err) {
    console.error("Get current user error:", err);

    return res.status(500).json({
      error: "Something went wrong fetching your account.",
    });
  }
});


// ============================================================
// LOGOUT
// ============================================================
//
// JWT is stateless, so the backend doesn't need to destroy
// the token. The frontend should remove the stored token.
//
// This endpoint exists so the frontend can call /auth/logout
// if needed.
// ============================================================

router.post("/logout", (req, res) => {
  return res.json({
    message: "Logged out successfully.",
  });
});


// ============================================================
// EXPORT
// ============================================================

module.exports = router;