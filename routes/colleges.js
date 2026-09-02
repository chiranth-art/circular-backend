// routes/colleges.js
const express = require("express");
const { readDB } = require("../db");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const db = await readDB();
    const publicColleges = db.colleges.map(({ id, name, code, city, lat, lng }) => ({
      id, name, code, city, lat, lng
    }));
    res.json(publicColleges);
  } catch (err) {
    console.error("Get colleges error:", err);
    res.status(500).json({ error: "Something went wrong loading colleges." });
  }
});

module.exports = router;