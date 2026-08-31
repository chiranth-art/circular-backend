// routes/auth.js
// Every route here handles one specific job in the auth flow.
// Read the comments top to bottom — they explain WHY each step exists,
// not just what it does.

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { readDB, writeDB } = require("../db");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-this";

// Small helper: does this user's email already exist?
function findUserByEmail(db, email) {
  return db.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
}

// ---------------------------------------------------------------
// POST /auth/signup/student
// Low-friction: no manual approval needed, account is active right away.
// ---------------------------------------------------------------
router.post("/signup/student", async (req, res) => {
  const { full_name, email, password, college_id, branch, year } = req.body;

  if (!full_name || !email || !password || !college_id) {
    return res.status(400).json({ error: "full_name, email, password, and college_id are required." });
  }

  const db = readDB();

  if (findUserByEmail(db, email)) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const collegeExists = db.colleges.some((c) => c.id === college_id);
  if (!collegeExists) {
    return res.status(400).json({ error: "Invalid college_id. Call GET /colleges to see valid options." });
  }

  // Never store the plain password — always hash it.
  const password_hash = await bcrypt.hash(password, 10);

  const newUser = {
    id: db.users.length + 1,
    full_name,
    email,
    password_hash,
    role: "student",
    college_id,
    branch: branch || null,
    year: year || null,
    is_verified: true, // students don't need manual approval
    created_at: new Date().toISOString()
  };

  db.users.push(newUser);
  writeDB(db);

  res.status(201).json({ message: "Student account created.", user_id: newUser.id });
});

// ---------------------------------------------------------------
// POST /auth/signup/admin
// Higher trust: the account is created but marked "not verified" until
// either (a) their email domain matches the college's known domain, or
// (b) someone manually approves them from the verification queue.
// ---------------------------------------------------------------
router.post("/signup/admin", async (req, res) => {
  const { full_name, email, password, college_id, club_name, designation } = req.body;

  if (!full_name || !email || !password || !college_id || !club_name) {
    return res.status(400).json({ error: "full_name, email, password, college_id, and club_name are required." });
  }

  const db = readDB();

  if (findUserByEmail(db, email)) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const college = db.colleges.find((c) => c.id === college_id);
  if (!college) {
    return res.status(400).json({ error: "Invalid college_id. Call GET /colleges to see valid options." });
  }

  const password_hash = await bcrypt.hash(password, 10);

  // This is the key trust check: does the email domain match the college's
  // registered domain? If yes, auto-verify. If not, they go into a queue
  // for a human to review.
  const emailDomain = email.split("@")[1]?.toLowerCase();
  const autoVerified = emailDomain === college.domain.toLowerCase();

  const newUser = {
    id: db.users.length + 1,
    full_name,
    email,
    password_hash,
    role: "admin",
    college_id,
    club_name,
    designation: designation || null,
    is_verified: autoVerified,
    created_at: new Date().toISOString()
  };

  db.users.push(newUser);

  if (!autoVerified) {
    db.verificationRequests.push({
      id: db.verificationRequests.length + 1,
      user_id: newUser.id,
      status: "pending",
      created_at: new Date().toISOString()
    });
  }

  writeDB(db);

  res.status(201).json({
    message: autoVerified
      ? "Admin account created and auto-verified (email domain matched college)."
      : "Admin account created. Awaiting manual verification since the email domain didn't match your college's registered domain.",
    user_id: newUser.id,
    is_verified: autoVerified
  });
});

// ---------------------------------------------------------------
// POST /auth/login
// Works for both students and admins. Returns a JWT the frontend should
// store (e.g. in memory or a cookie) and send back on future requests.
// ---------------------------------------------------------------
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "email and password are required." });
  }

  const db = readDB();
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

  // The token carries just enough info to identify the user on future
  // requests, without hitting the database every time.
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
});

module.exports = router;
