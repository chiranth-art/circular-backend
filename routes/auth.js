// routes/auth.js
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { readDB, writeDB } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

function findUserByEmail(db, email) {
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

router.post("/signup/student", async (req, res) => {
  try {
    const { full_name, email, password, college_id, branch, year } = req.body;

    if (!full_name || !email || !password || !college_id) {
      return res.status(400).json({ error: "full_name, email, password, and college_id are required." });
    }

    const db = await readDB();

    if (findUserByEmail(db, email)) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const collegeExists = db.colleges.some((c) => c.id === Number(college_id));
    if (!collegeExists) {
      return res.status(400).json({ error: "Invalid college_id. Call GET /colleges to see valid options." });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const newUser = {
      full_name,
      email,
      password_hash,
      role: "student",
      college_id: Number(college_id),
      branch: branch || null,
      year: year || null,
      is_verified: true
    };

    db.users.push(newUser);
    await writeDB(db);

    res.status(201).json({ message: "Student account created.", user_id: newUser.id });
  } catch (err) {
    console.error("Student signup error:", err);
    res.status(500).json({ error: "Something went wrong creating your account." });
  }
});

router.post("/signup/admin", async (req, res) => {
  try {
    const { full_name, email, password, college_id, club_name, designation } = req.body;

    if (!full_name || !email || !password || !college_id || !club_name) {
      return res.status(400).json({ error: "full_name, email, password, college_id, and club_name are required." });
    }

    const db = await readDB();

    if (findUserByEmail(db, email)) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const college = db.colleges.find((c) => c.id === Number(college_id));
    if (!college) {
      return res.status(400).json({ error: "Invalid college_id. Call GET /colleges to see valid options." });
    }

    const password_hash = await bcrypt.hash(password, 10);

    const emailDomain = email.split("@")[1]?.toLowerCase();
    const autoVerified = emailDomain === (college.domain || "").toLowerCase();

    const newUser = {
      full_name,
      email,
      password_hash,
      role: "admin",
      college_id: Number(college_id),
      club_name,
      designation: designation || null,
      is_verified: autoVerified
    };

    db.users.push(newUser);
    await writeDB(db);

    if (!autoVerified) {
      db.verificationRequests.push({
        user_id: newUser.id,
        status: "pending"
      });
      await writeDB(db);
    }

    res.status(201).json({
      message: autoVerified
        ? "Admin account created and auto-verified (email domain matched college)."
        : "Admin account created. Awaiting manual verification since the email domain didn't match your college's registered domain.",
      user_id: newUser.id,
      is_verified: autoVerified
    });
  } catch (err) {
    console.error("Admin signup error:", err);
    res.status(500).json({ error: "Something went wrong creating your account." });
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "email and password are required." });
    }

    const db = await readDB();
    const user = findUserByEmail(db, email);

    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const passwordMatches = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatches) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    if (user.role === "admin" && !user.is_verified) {
      return res.status(403).json({ error: "Your admin account is still pending verification." });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, college_id: user.college_id },
      JWT_SECRET,
      { expiresIn: "7d" }
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
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Something went wrong logging in." });
  }
});

module.exports = router;