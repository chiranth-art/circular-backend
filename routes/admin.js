// routes/admin.js

const express = require("express");
const { query } = require("../db");
const {
  verifyToken,
  requireVerifiedAdmin,
} = require("../middleware/auth");

const router = express.Router();

// ============================================================
// ADMIN AUTHORIZATION
// Every route in this file requires:
// 1. Valid JWT
// 2. Admin role
// 3. Verified admin account
// ============================================================

router.use(verifyToken);
router.use(requireVerifiedAdmin);

// ============================================================
// GET /admin/me
// Get the currently logged-in admin's profile
// ============================================================

router.get("/me", async (req, res) => {
  try {
    const result = await query(
      `
      SELECT
        id,
        full_name,
        email,
        role,
        college_id,
        club_name,
        designation,
        is_verified,
        created_at
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [req.admin.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Admin account not found.",
      });
    }

    res.json({
      admin: result.rows[0],
    });
  } catch (err) {
    console.error("Get admin profile error:", err);

    res.status(500).json({
      error: "Something went wrong loading the admin profile.",
    });
  }
});

// ============================================================
// GET /admin/dashboard
// Basic dashboard information for the admin's college
// ============================================================

router.get("/dashboard", async (req, res) => {
  try {
    const collegeId = req.admin.college_id;

    if (!collegeId) {
      return res.status(400).json({
        error: "Admin account is not associated with a college.",
      });
    }

    const eventsResult = await query(
      `
      SELECT COUNT(*)::int AS total_events
      FROM events
      WHERE college_id = $1
      `,
      [collegeId]
    );

    const upcomingResult = await query(
      `
      SELECT COUNT(*)::int AS upcoming_events
      FROM events
      WHERE college_id = $1
        AND date >= CURRENT_DATE::text
      `,
      [collegeId]
    );

    const studentsResult = await query(
      `
      SELECT COUNT(*)::int AS total_students
      FROM users
      WHERE college_id = $1
        AND role = 'student'
      `,
      [collegeId]
    );

    const myEventsResult = await query(
      `
      SELECT COUNT(*)::int AS my_events
      FROM events
      WHERE college_id = $1
        AND posted_by = $2
      `,
      [collegeId, req.admin.id]
    );

    res.json({
      college_id: collegeId,
      admin: {
        id: req.admin.id,
        full_name: req.admin.full_name,
        email: req.admin.email,
        club_name: req.admin.club_name,
        designation: req.admin.designation,
      },
      statistics: {
        total_events: eventsResult.rows[0].total_events,
        upcoming_events: upcomingResult.rows[0].upcoming_events,
        total_students: studentsResult.rows[0].total_students,
        my_events: myEventsResult.rows[0].my_events,
      },
    });
  } catch (err) {
    console.error("Admin dashboard error:", err);

    res.status(500).json({
      error: "Something went wrong loading the admin dashboard.",
    });
  }
});

// ============================================================
// GET /admin/events
// List events belonging only to the admin's college
// ============================================================

router.get("/events", async (req, res) => {
  try {
    const result = await query(
      `
      SELECT
        e.*,
        u.full_name AS posted_by_name
      FROM events e
      LEFT JOIN users u
        ON u.id = e.posted_by
      WHERE e.college_id = $1
      ORDER BY e.created_at DESC
      `,
      [req.admin.college_id]
    );

    res.json({
      college_id: req.admin.college_id,
      events: result.rows,
    });
  } catch (err) {
    console.error("Admin events error:", err);

    res.status(500).json({
      error: "Something went wrong loading admin events.",
    });
  }
});

// ============================================================
// POST /admin/events
// Create a new event for the admin's college
// ============================================================

router.post("/events", async (req, res) => {
  try {
    const {
      ref_id,
      title,
      date,
      venue,
      category,
      description = "",
      registration_link = "",
    } = req.body;

    if (!title || !date || !venue || !category) {
      return res.status(400).json({
        error: "title, date, venue, and category are required.",
      });
    }

    if (!req.admin.college_id) {
      return res.status(400).json({
        error: "Admin account is not associated with a college.",
      });
    }

    const result = await query(
      `
      INSERT INTO events
      (
        ref_id,
        title,
        date,
        venue,
        category,
        description,
        registration_link,
        college_id,
        posted_by
      )
      VALUES
      (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9
      )
      RETURNING *
      `,
      [
        ref_id || null,
        title,
        date,
        venue,
        category,
        description,
        registration_link,
        req.admin.college_id,
        req.admin.id,
      ]
    );

    res.status(201).json({
      message: "Event created successfully.",
      event: result.rows[0],
    });
  } catch (err) {
    console.error("Admin create event error:", err);

    res.status(500).json({
      error: "Something went wrong creating the event.",
    });
  }
});

// ============================================================
// PATCH /admin/events/:id
// Update an event belonging to the admin's college
// ============================================================

router.patch("/events/:id", async (req, res) => {
  try {
    const eventId = Number(req.params.id);

    if (!Number.isInteger(eventId)) {
      return res.status(400).json({
        error: "Invalid event ID.",
      });
    }

    const existingResult = await query(
      `
      SELECT *
      FROM events
      WHERE id = $1
        AND college_id = $2
      LIMIT 1
      `,
      [eventId, req.admin.college_id]
    );

    if (existingResult.rows.length === 0) {
      return res.status(404).json({
        error: "Event not found in your college.",
      });
    }

    const existingEvent = existingResult.rows[0];

    const {
      ref_id,
      title,
      date,
      venue,
      category,
      description,
      registration_link,
    } = req.body;

    const updatedResult = await query(
      `
      UPDATE events
      SET
        ref_id = $1,
        title = $2,
        date = $3,
        venue = $4,
        category = $5,
        description = $6,
        registration_link = $7
      WHERE id = $8
        AND college_id = $9
      RETURNING *
      `,
      [
        ref_id !== undefined ? ref_id : existingEvent.ref_id,
        title !== undefined ? title : existingEvent.title,
        date !== undefined ? date : existingEvent.date,
        venue !== undefined ? venue : existingEvent.venue,
        category !== undefined ? category : existingEvent.category,
        description !== undefined
          ? description
          : existingEvent.description,
        registration_link !== undefined
          ? registration_link
          : existingEvent.registration_link,
        eventId,
        req.admin.college_id,
      ]
    );

    res.json({
      message: "Event updated successfully.",
      event: updatedResult.rows[0],
    });
  } catch (err) {
    console.error("Admin update event error:", err);

    res.status(500).json({
      error: "Something went wrong updating the event.",
    });
  }
});

// ============================================================
// DELETE /admin/events/:id
// Delete an event belonging to the admin's college
// ============================================================

router.delete("/events/:id", async (req, res) => {
  try {
    const eventId = Number(req.params.id);

    if (!Number.isInteger(eventId)) {
      return res.status(400).json({
        error: "Invalid event ID.",
      });
    }

    const result = await query(
      `
      DELETE FROM events
      WHERE id = $1
        AND college_id = $2
      RETURNING id, title, college_id
      `,
      [eventId, req.admin.college_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Event not found in your college.",
      });
    }

    res.json({
      message: "Event deleted successfully.",
      event: result.rows[0],
    });
  } catch (err) {
    console.error("Admin delete event error:", err);

    res.status(500).json({
      error: "Something went wrong deleting the event.",
    });
  }
});

// ============================================================
// GET /admin/students
// List students belonging only to the admin's college
// ============================================================

router.get("/students", async (req, res) => {
  try {
    const result = await query(
      `
      SELECT
        id,
        full_name,
        email,
        branch,
        year,
        is_verified,
        created_at
      FROM users
      WHERE college_id = $1
        AND role = 'student'
      ORDER BY full_name ASC
      `,
      [req.admin.college_id]
    );

    res.json({
      college_id: req.admin.college_id,
      total_students: result.rows.length,
      students: result.rows,
    });
  } catch (err) {
    console.error("Admin students error:", err);

    res.status(500).json({
      error: "Something went wrong loading students.",
    });
  }
});

// ============================================================
// GET /admin/stats
// Basic statistics for the admin's college
// ============================================================

router.get("/stats", async (req, res) => {
  try {
    const collegeId = req.admin.college_id;

    const eventStats = await query(
      `
      SELECT
        COUNT(*)::int AS total_events,
        COUNT(*) FILTER (
          WHERE date >= CURRENT_DATE::text
        )::int AS upcoming_events,
        COUNT(*) FILTER (
          WHERE date < CURRENT_DATE::text
        )::int AS past_events
      FROM events
      WHERE college_id = $1
      `,
      [collegeId]
    );

    const categoryStats = await query(
      `
      SELECT
        category,
        COUNT(*)::int AS event_count
      FROM events
      WHERE college_id = $1
      GROUP BY category
      ORDER BY event_count DESC
      `,
      [collegeId]
    );

    const studentStats = await query(
      `
      SELECT COUNT(*)::int AS total_students
      FROM users
      WHERE college_id = $1
        AND role = 'student'
      `,
      [collegeId]
    );

    res.json({
      college_id: collegeId,
      events: eventStats.rows[0],
      students: {
        total_students: studentStats.rows[0].total_students,
      },
      categories: categoryStats.rows,
    });
  } catch (err) {
    console.error("Admin stats error:", err);

    res.status(500).json({
      error: "Something went wrong loading admin statistics.",
    });
  }
});

// ============================================================
// EXPORT
// ============================================================

module.exports = router;