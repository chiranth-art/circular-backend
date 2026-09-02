const express = require("express");
const { readDB } = require("../db");
const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const db = await readDB();
    const categoryCounts = {};
    db.events.forEach((e) => { categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1; });
    const categories = Object.entries(categoryCounts).map(([category, count]) => ({ category, count }));
    res.json({ total_colleges: db.colleges.length, total_events: db.events.length, categories });
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({ error: "Something went wrong loading stats." });
  }
});

module.exports = router;