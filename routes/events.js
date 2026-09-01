// routes/events.js
const express = require("express");
const { readDB, writeDB } = require("../db");
const { verifyToken, requireVerifiedAdmin } = require("../middleware/auth");

const router = express.Router();

// Calculates the real straight-line distance in km between two
// lat/lng points on Earth's surface. This is the "Haversine formula" —
// standard math for this, nothing custom or approximate about it.
function distanceInKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------------------------------------------------------
// GET /events
// Public — anyone can browse, no login needed. Supports optional
// filters as query params: ?college_id=1&category=Hackathon&search=robo
//
// For "near me": pass ?lat=12.97&lng=77.59 (the student's own browser
// location — the FRONTEND gets this via navigator.geolocation, not
// this backend). When present, every event gets a distance_km field
// and results are sorted nearest-first automatically.
// ---------------------------------------------------------------
router.get("/", (req, res) => {
  const db = readDB();
  const { college_id, category, search, lat, lng } = req.query;

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

  // Attach the college name (and city/coords) so the frontend doesn't
  // need a second request.
  let withCollegeNames = results.map((e) => {
    const college = db.colleges.find((c) => c.id === e.college_id);
    return {
      ...e,
      college_name: college ? college.name : "Unknown",
      college_city: college ? college.city : null
    };
  });

  const studentLat = lat !== undefined ? Number(lat) : null;
  const studentLng = lng !== undefined ? Number(lng) : null;
  const hasLocation = studentLat !== null && studentLng !== null && !isNaN(studentLat) && !isNaN(studentLng);

  if (hasLocation) {
    withCollegeNames = withCollegeNames.map((e) => {
      const college = db.colleges.find((c) => c.id === e.college_id);
      const distance_km =
        college && college.lat !== undefined
          ? Math.round(distanceInKm(studentLat, studentLng, college.lat, college.lng) * 10) / 10
          : null;
      return { ...e, distance_km };
    });
    // Nearest first. Events with unknown distance (shouldn't normally
    // happen) sort to the end instead of crashing the sort.
    withCollegeNames.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
  } else {
    withCollegeNames.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

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