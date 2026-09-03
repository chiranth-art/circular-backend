// routes/events.js
// Event API routes for Circular

const express = require("express");
const { query } = require("../db");
const { verifyToken } = require("../middleware/auth");
const { createBulkNotifications } = require("../services/notificationService");

const router = express.Router();

// ============================================================
// GET ALL EVENTS
// GET /events
// ============================================================

router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        e.id,
        e.ref_id,
        e.title,
        e.date,
        e.venue,
        e.category,
        e.description,
        e.registration_link,
        e.college_id,
        e.posted_by,
        e.created_at,
        c.name AS college_name,
        c.code AS college_code,
        c.city AS college_city
      FROM events e
      LEFT JOIN colleges c
        ON c.id = e.college_id
      ORDER BY e.date ASC, e.id ASC
    `);

    res.json({
      success: true,
      count: result.rows.length,
      events: result.rows
    });

  } catch (error) {
    console.error("❌ Get events error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch events"
    });
  }
});

// ============================================================
// SEARCH EVENTS
// GET /events/search?q=hackathon
// ============================================================

router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }

    const result = await query(
      `
      SELECT
        e.id,
        e.ref_id,
        e.title,
        e.date,
        e.venue,
        e.category,
        e.description,
        e.registration_link,
        e.college_id,
        e.created_at,
        c.name AS college_name,
        c.code AS college_code,
        c.city AS college_city
      FROM events e
      LEFT JOIN colleges c
        ON c.id = e.college_id
      WHERE
        e.title ILIKE $1
        OR e.category ILIKE $1
        OR e.description ILIKE $1
        OR c.name ILIKE $1
        OR c.code ILIKE $1
        OR c.city ILIKE $1
      ORDER BY e.date ASC
      LIMIT 100
      `,
      [`%${q}%`]
    );

    res.json({
      success: true,
      count: result.rows.length,
      events: result.rows
    });

  } catch (error) {
    console.error("❌ Event search error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to search events"
    });
  }
});

// ============================================================
// FILTER BY CATEGORY
// GET /events/category/:category
// ============================================================

router.get("/category/:category", async (req, res) => {
  try {
    const category = req.params.category.trim();

    const result = await query(
      `
      SELECT
        e.id,
        e.ref_id,
        e.title,
        e.date,
        e.venue,
        e.category,
        e.description,
        e.registration_link,
        e.college_id,
        e.created_at,
        c.name AS college_name,
        c.code AS college_code,
        c.city AS college_city
      FROM events e
      LEFT JOIN colleges c
        ON c.id = e.college_id
      WHERE e.category ILIKE $1
      ORDER BY e.date ASC
      `,
      [category]
    );

    res.json({
      success: true,
      count: result.rows.length,
      events: result.rows
    });

  } catch (error) {
    console.error("❌ Category events error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch category events"
    });
  }
});

// ============================================================
// FILTER BY COLLEGE
// GET /events/college/:collegeId
// ============================================================

router.get("/college/:collegeId", async (req, res) => {
  try {
    const collegeId = Number(req.params.collegeId);

    if (!Number.isInteger(collegeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid college ID"
      });
    }

    const result = await query(
      `
      SELECT
        e.id,
        e.ref_id,
        e.title,
        e.date,
        e.venue,
        e.category,
        e.description,
        e.registration_link,
        e.college_id,
        e.created_at,
        c.name AS college_name,
        c.code AS college_code,
        c.city AS college_city
      FROM events e
      LEFT JOIN colleges c
        ON c.id = e.college_id
      WHERE e.college_id = $1
      ORDER BY e.date ASC
      `,
      [collegeId]
    );

    res.json({
      success: true,
      count: result.rows.length,
      events: result.rows
    });

  } catch (error) {
    console.error("❌ College events error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch college events"
    });
  }
});

// ============================================================
// GET UPCOMING EVENTS
// GET /events/upcoming
// ============================================================

router.get("/upcoming", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        e.id,
        e.ref_id,
        e.title,
        e.date,
        e.venue,
        e.category,
        e.description,
        e.registration_link,
        e.college_id,
        e.created_at,
        c.name AS college_name,
        c.code AS college_code,
        c.city AS college_city
      FROM events e
      LEFT JOIN colleges c
        ON c.id = e.college_id
      WHERE e.date >= CURRENT_DATE::text
      ORDER BY e.date ASC
      LIMIT 100
    `);

    res.json({
      success: true,
      count: result.rows.length,
      events: result.rows
    });

  } catch (error) {
    console.error("❌ Upcoming events error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch upcoming events"
    });
  }
});

// ============================================================
// CREATE EVENT
// POST /events
//
// Only authenticated admins can create events.
//
// After the event is created:
//   1. Find students belonging to the event college.
//   2. Create an in-app notification for each student.
// ============================================================

router.post("/", verifyToken, async (req, res) => {
  try {
    // ----------------------------------------------------------
    // AUTHORIZATION
    // ----------------------------------------------------------

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can create events"
      });
    }

    // ----------------------------------------------------------
    // READ REQUEST BODY
    // ----------------------------------------------------------

    const {
      ref_id,
      title,
      date,
      venue,
      category,
      description,
      registration_link,
      college_id
    } = req.body;

    // ----------------------------------------------------------
    // VALIDATION
    // ----------------------------------------------------------

    if (!title || !date || !venue || !category || !college_id) {
      return res.status(400).json({
        success: false,
        message:
          "title, date, venue, category, and college_id are required"
      });
    }

    const collegeId = Number(college_id);

    if (!Number.isInteger(collegeId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid college_id"
      });
    }

    // ----------------------------------------------------------
    // CHECK COLLEGE
    // ----------------------------------------------------------

    const collegeResult = await query(
      `
      SELECT
        id,
        name,
        code
      FROM colleges
      WHERE id = $1
      `,
      [collegeId]
    );

    if (collegeResult.rows.length === 0) {
      return res.status(400).json({
        success: false,
        message: "College not found"
      });
    }

    const college = collegeResult.rows[0];

    // ----------------------------------------------------------
    // CREATE EVENT
    // ----------------------------------------------------------

    const eventResult = await query(
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
      ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING
        id,
        ref_id,
        title,
        date,
        venue,
        category,
        description,
        registration_link,
        college_id,
        posted_by,
        created_at
      `,
      [
        ref_id || null,
        title,
        date,
        venue,
        category,
        description || "",
        registration_link || "",
        collegeId,
        req.user.id
      ]
    );

    const event = eventResult.rows[0];

    // ----------------------------------------------------------
    // FIND STUDENTS FOR THIS COLLEGE
    // ----------------------------------------------------------

    const studentsResult = await query(
      `
      SELECT id
      FROM users
      WHERE
        role = 'student'
        AND college_id = $1
      ORDER BY id
      `,
      [collegeId]
    );

    const studentIds = studentsResult.rows.map(
      (student) => student.id
    );

    // ----------------------------------------------------------
    // CREATE AUTOMATIC NOTIFICATIONS
    // ----------------------------------------------------------

    let notifications = [];

    if (studentIds.length > 0) {
      notifications = await createBulkNotifications(
        studentIds,
        {
          type: "new_event",
          title: `New Event: ${event.title}`,
          message: `${college.name} has posted a new event on Circular.`,
          eventId: event.id
        }
      );
    }

    // ----------------------------------------------------------
    // RESPONSE
    // ----------------------------------------------------------

    res.status(201).json({
      success: true,
      message: "Event created successfully",
      event,
      notifications_created: notifications.length
    });

  } catch (error) {
    console.error("❌ Create event error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to create event"
    });
  }
});

// ============================================================
// GET SINGLE EVENT
// GET /events/:id
// ============================================================

router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID"
      });
    }

    const result = await query(
      `
      SELECT
        e.id,
        e.ref_id,
        e.title,
        e.date,
        e.venue,
        e.category,
        e.description,
        e.registration_link,
        e.college_id,
        e.posted_by,
        e.created_at,
        c.name AS college_name,
        c.code AS college_code,
        c.city AS college_city,
        c.website AS college_website
      FROM events e
      LEFT JOIN colleges c
        ON c.id = e.college_id
      WHERE e.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Event not found"
      });
    }

    res.json({
      success: true,
      event: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Single event error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch event"
    });
  }
});

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;