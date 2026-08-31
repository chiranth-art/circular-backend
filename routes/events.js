// routes/events.js
const express = require("express");
const { readDB, writeDB } = require("../db");
const { verifyToken, requireVerifiedAdmin } = require("../middleware/auth");

const router = express.Router();

// ---------------------------------------------------------------
// GET /events
// Public — anyone can browse, no login needed. Supports optional
// filters as query params: ?college_id=1&category=Hackathon&search=robo
// ---------------------------------------------------------------
router.get("/", (req, res) => {
  const db = readDB();
  const { college_id, category, search } = req.query;

  let results = db.events;

  if (college_id) {
    results = results.filter((e) => e.college_id === Number(college_id));
  }
  if (category) {
    results = results.filter((e) => e.category.toLowerCase() === category.toLowerCase());
  }
  if (search) {
    const s = search.toLowerCase();
    results = results.filter(
      (e) => e.title.toLowerCase().includes(s) || e.description.toLowerCase().includes(s)
    );
  }

  // Attach the college name so the frontend doesn't need a second request.
  const withCollegeNames = results.map((e) => {
    const college = db.colleges.find((c) => c.id === e.college_id);
    return { ...e, college_name: college ? college.name : "Unknown" };
  });

  withCollegeNames.sort((a, b) => new Date(a.date) - new Date(b.date));

  res.json(withCollegeNames);
});

// ---------------------------------------------------------------
// POST /events
// Protected — must be logged in AND be a verified admin.
// verifyToken runs first (checks the token), then requireVerifiedAdmin
// (checks role + verification status) — if either fails, this handler
// never runs at all.
// ---------------------------------------------------------------
router.post("/", verifyToken, requireVerifiedAdmin, (req, res) => {
  const { title, date, venue, category, description, registration_link } = req.body;

  if (!title || !date || !venue || !category) {
    return res.status(400).json({ error: "title, date, venue, and category are required." });
  }

  const db = readDB();
  const college = db.colleges.find((c) => c.id === req.user.college_id);

  // Build a reference ID like "RVCE-003" — college code + running count
  // for that college. Purely cosmetic/traceable, not used for logic.
  const existingCount = db.events.filter((e) => e.college_id === req.user.college_id).length;
  const ref_id = `${college.code}-${String(existingCount + 1).padStart(3, "0")}`;

  const newEvent = {
    id: db.events.length + 1,
    ref_id,
    title,
    date,
    venue,
    category,
    description: description || "",
    registration_link: registration_link || "",
    college_id: req.user.college_id,
    posted_by: req.user.id,
    created_at: new Date().toISOString()
  };

  db.events.push(newEvent);
  writeDB(db);

  res.status(201).json({ message: "Event published.", event: newEvent });
});

module.exports = router;
