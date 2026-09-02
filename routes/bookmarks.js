// routes/bookmarks.js
const express = require("express");
const { readDB, writeDB } = require("../db");
const { verifyToken } = require("../middleware/auth");

const router = express.Router();

router.post("/", verifyToken, async (req, res) => {
  try {
    const { event_id } = req.body;
    if (!event_id) {
      return res.status(400).json({ error: "event_id is required." });
    }

    const db = await readDB();
    const event = db.events.find((e) => e.id === Number(event_id));
    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    const alreadyBookmarked = db.bookmarks.some(
      (b) => b.user_id === req.user.id && b.event_id === Number(event_id)
    );
    if (alreadyBookmarked) {
      return res.status(409).json({ error: "Already bookmarked." });
    }

    db.bookmarks.push({ user_id: req.user.id, event_id: Number(event_id) });
    await writeDB(db);

    res.status(201).json({ message: "Event bookmarked." });
  } catch (err) {
    console.error("Bookmark error:", err);
    res.status(500).json({ error: "Something went wrong bookmarking this event." });
  }
});

router.get("/", verifyToken, async (req, res) => {
  try {
    const db = await readDB();
    const myBookmarks = db.bookmarks.filter((b) => b.user_id === req.user.id);

    const events = myBookmarks
      .map((b) => {
        const event = db.events.find((e) => e.id === b.event_id);
        if (!event) return null;
        const college = db.colleges.find((c) => c.id === event.college_id);
        return {
          ...event,
          college_name: college ? college.name : "Unknown",
          bookmarked_at: b.created_at
        };
      })
      .filter(Boolean);

    res.json(events);
  } catch (err) {
    console.error("Get bookmarks error:", err);
    res.status(500).json({ error: "Something went wrong loading bookmarks." });
  }
});

router.delete("/:eventId", verifyToken, async (req, res) => {
  try {
    const db = await readDB();
    const eventId = Number(req.params.eventId);

    const exists = db.bookmarks.some((b) => b.user_id === req.user.id && b.event_id === eventId);
    if (!exists) {
      return res.status(404).json({ error: "Bookmark not found." });
    }

    db.bookmarks = db.bookmarks.filter((b) => !(b.user_id === req.user.id && b.event_id === eventId));
    await writeDB(db);

    res.json({ message: "Bookmark removed." });
  } catch (err) {
    console.error("Remove bookmark error:", err);
    res.status(500).json({ error: "Something went wrong removing this bookmark." });
  }
});

module.exports = router;