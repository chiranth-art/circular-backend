// routes/colleges.js
// The frontend will call this to fill the "select your college" dropdown
// on both the student and admin signup forms.

const express = require("express");
const { readDB } = require("../db");

const router = express.Router();

router.get("/", (req, res) => {
  const db = readDB();
  // Don't send the domain to the public frontend — it's only needed
  // internally for the auto-verification check. City/lat/lng ARE
  // public — the frontend needs them to show distance/city info.
  const publicColleges = db.colleges.map(({ id, name, code, city, lat, lng }) => ({
    id, name, code, city, lat, lng
  }));
  res.json(publicColleges);
});

module.exports = router;