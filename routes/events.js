// routes/events.js
const express = require("express");
const { readDB, writeDB } = require("../db");
const { verifyToken, requireVerifiedAdmin } = require("../middleware/auth");

const router = express.Router();

function distanceInKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
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

router.get("/", async (req, res) => {
  try {
    const db = await readDB();
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
        (e) => e.title.toLowerCase().includes(s) || (e.description || "").toLowerCase().includes(s)
      );
    }

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
          college && college.lat !== undefined && college.lat !== null
            ? Math.round(distanceInKm(studentLat, studentLng, college.lat, college.lng) * 10) / 10
            : null;
        return { ...e, distance_km };
      });
      withCollegeNames.sort((a, b) => (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
    } else {
      withCollegeNames.sort((a, b) => new Date(a.date) - new Date(b.date));
    }

    res.json(withCollegeNames);
  } catch (err) {
    console.error("Get events error:", err);
    res.status(500).json({ error: "Something went wrong loading events." });
  }
});

router.post("/", verifyToken, requireVerifiedAdmin, async (req, res) => {
  try {
    const { title, date, venue, category, description, registration_link } = req.body;

    if (!title || !date || !venue || !category) {
      return res.status(400).json({ error: "title, date, venue, and category are required." });
    }

    const db = await readDB();
    const college = db.colleges.find((c) => c.id === req.user.college_id);

    const existingCount = db.events.filter((e) => e.college_id === req.user.college_id).length;
    const ref_id = `${college.code}-${String(existingCount + 1).padStart(3, "0")}`;

    const newEvent = {
      ref_id,
      title,
      date,
      venue,
      category,
      description: description || "",
      registration_link: registration_link || "",
      college_id: req.user.college_id,
      posted_by: req.user.id
    };

    db.events.push(newEvent);
    await writeDB(db);

    res.status(201).json({ message: "Event published.", event: newEvent });
  } catch (err) {
    console.error("Post event error:", err);
    res.status(500).json({ error: "Something went wrong publishing your event." });
  }
});

module.exports = router;