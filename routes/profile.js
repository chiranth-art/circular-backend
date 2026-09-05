// routes/profile.js

const express = require("express");
const bcrypt = require("bcryptjs");
const { query } = require("../db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

// ============================================================
// AUTHENTICATION
// Every profile route requires a valid JWT.
// ============================================================

router.use(verifyToken);

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasUnsupportedFields(body, allowedFields) {
  const unsupportedFields = Object.keys(body).filter(
    (field) => !allowedFields.includes(field)
  );

  return unsupportedFields;
}

// ============================================================
// GET /profile
// Get the currently logged-in user's profile.
// Works for both students and admins.
// ============================================================

router.get("/", async (req, res) => {
  try {
    const result = await query(
      `
      SELECT
        u.id,
        u.full_name,
        u.email,
        u.role,
        u.college_id,
        c.name AS college_name,
        u.branch,
        u.year,
        u.club_name,
        u.designation,
        u.is_verified,
        u.created_at
      FROM users u
      LEFT JOIN colleges c
        ON c.id = u.college_id
      WHERE u.id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User account not found.",
      });
    }

    res.json({
      profile: result.rows[0],
    });
  } catch (err) {
    console.error("Get profile error:", err);

    res.status(500).json({
      error: "Something went wrong loading your profile.",
    });
  }
});

// ============================================================
// PATCH /profile
// Update allowed profile information.
//
// Student:
// - full_name
// - branch
// - year
//
// Admin:
// - full_name
// - club_name
// - designation
//
// Protected:
// - id
// - email
// - role
// - college_id
// - is_verified
// - password_hash
// - created_at
// ============================================================

router.patch("/", async (req, res) => {
  try {
    const body = req.body || {};

    const userResult = await query(
      `
      SELECT
        id,
        role,
        full_name,
        branch,
        year,
        club_name,
        designation
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: "User account not found.",
      });
    }

    const user = userResult.rows[0];

    // --------------------------------------------------------
    // STUDENT PROFILE
    // --------------------------------------------------------

    if (user.role === "student") {
      const allowedFields = ["full_name", "branch", "year"];

      const unsupportedFields = hasUnsupportedFields(
        body,
        allowedFields
      );

      if (unsupportedFields.length > 0) {
        return res.status(400).json({
          error: "Unsupported profile fields.",
          fields: unsupportedFields,
        });
      }

      const fullName =
        body.full_name !== undefined
          ? body.full_name.trim()
          : user.full_name;

      const branch =
        body.branch !== undefined
          ? body.branch.trim()
          : user.branch;

      const year =
        body.year !== undefined
          ? body.year.trim()
          : user.year;

      if (!isNonEmptyString(fullName)) {
        return res.status(400).json({
          error: "full_name cannot be empty.",
        });
      }

      if (
        body.branch !== undefined &&
        !isNonEmptyString(branch)
      ) {
        return res.status(400).json({
          error: "branch cannot be empty.",
        });
      }

      if (
        body.year !== undefined &&
        !isNonEmptyString(year)
      ) {
        return res.status(400).json({
          error: "year cannot be empty.",
        });
      }

      const result = await query(
        `
        UPDATE users
        SET
          full_name = $1,
          branch = $2,
          year = $3
        WHERE id = $4
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
          fullName,
          branch,
          year,
          req.user.id,
        ]
      );

      return res.json({
        message: "Profile updated successfully.",
        profile: result.rows[0],
      });
    }

    // --------------------------------------------------------
    // ADMIN PROFILE
    // --------------------------------------------------------

    if (user.role === "admin") {
      const allowedFields = [
        "full_name",
        "club_name",
        "designation",
      ];

      const unsupportedFields = hasUnsupportedFields(
        body,
        allowedFields
      );

      if (unsupportedFields.length > 0) {
        return res.status(400).json({
          error: "Unsupported profile fields.",
          fields: unsupportedFields,
        });
      }

      const fullName =
        body.full_name !== undefined
          ? body.full_name.trim()
          : user.full_name;

      const clubName =
        body.club_name !== undefined
          ? body.club_name.trim()
          : user.club_name;

      const designation =
        body.designation !== undefined
          ? body.designation.trim()
          : user.designation;

      if (!isNonEmptyString(fullName)) {
        return res.status(400).json({
          error: "full_name cannot be empty.",
        });
      }

      if (
        body.club_name !== undefined &&
        !isNonEmptyString(clubName)
      ) {
        return res.status(400).json({
          error: "club_name cannot be empty.",
        });
      }

      if (
        body.designation !== undefined &&
        !isNonEmptyString(designation)
      ) {
        return res.status(400).json({
          error: "designation cannot be empty.",
        });
      }

      const result = await query(
        `
        UPDATE users
        SET
          full_name = $1,
          club_name = $2,
          designation = $3
        WHERE id = $4
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
          fullName,
          clubName,
          designation,
          req.user.id,
        ]
      );

      return res.json({
        message: "Profile updated successfully.",
        profile: result.rows[0],
      });
    }

    return res.status(403).json({
      error: "This user role cannot update a profile.",
    });
  } catch (err) {
    console.error("Update profile error:", err);

    res.status(500).json({
      error: "Something went wrong updating your profile.",
    });
  }
});

// ============================================================
// PATCH /profile/password
// Change password.
//
// Requirements:
// - current_password
// - new_password
//
// New password:
// - minimum 8 characters
// - at least one uppercase letter
// - at least one lowercase letter
// - at least one number
// - must differ from current password
// ============================================================

router.patch("/password", async (req, res) => {
  try {
    const {
      current_password,
      new_password,
    } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({
        error:
          "current_password and new_password are required.",
      });
    }

    if (typeof new_password !== "string") {
      return res.status(400).json({
        error: "New password must be a string.",
      });
    }

    if (new_password.length < 8) {
      return res.status(400).json({
        error: "New password must be at least 8 characters long.",
      });
    }

    if (!/[A-Z]/.test(new_password)) {
      return res.status(400).json({
        error:
          "New password must contain at least one uppercase letter.",
      });
    }

    if (!/[a-z]/.test(new_password)) {
      return res.status(400).json({
        error:
          "New password must contain at least one lowercase letter.",
      });
    }

    if (!/[0-9]/.test(new_password)) {
      return res.status(400).json({
        error:
          "New password must contain at least one number.",
      });
    }

    const result = await query(
      `
      SELECT
        id,
        password_hash
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "User account not found.",
      });
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      current_password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: "Current password is incorrect.",
      });
    }

    const samePassword = await bcrypt.compare(
      new_password,
      user.password_hash
    );

    if (samePassword) {
      return res.status(400).json({
        error:
          "New password must be different from your current password.",
      });
    }

    const newPasswordHash = await bcrypt.hash(
      new_password,
      10
    );

    await query(
      `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
      `,
      [newPasswordHash, req.user.id]
    );

    res.json({
      message: "Password changed successfully.",
    });
  } catch (err) {
    console.error("Change password error:", err);

    res.status(500).json({
      error: "Something went wrong changing your password.",
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

module.exports = router;