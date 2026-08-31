const express = require("express");
const { readDB } = require("../db");
const router = express.Router();
router.get("/", (req, res) => {
    const db = readDB();
    const categoryCounts = {};
    db.events.forEach((e) => { categoryCounts[e.category] = (categoryCounts[e.category] || 0) + 1; });
    const categories = Object.entries(categoryCounts).map(([category, count]) => ({ category, count }));
    res.json({ total_colleges: db.colleges.length, total_events: db.events.length, categories });
});
module.exports = router;