// routes/events.js

const express = require("express");
const { query } = require("../db");
const { verifyToken, requireVerifiedAdmin } = require("../middleware/auth");
const {
  createBulkNotifications
} = require("../services/notificationService");

const router = express.Router();

/*
|--------------------------------------------------------------------------
| GET ALL EVENTS
|--------------------------------------------------------------------------
*/
router.get("/", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        e.*,
        c.name AS college_name
      FROM events e
      LEFT JOIN colleges c
        ON e.college_id = c.id
      ORDER BY e.date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Get events error:", err);
    res.status(500).json({
      error: "Something went wrong fetching events."
    });
  }
});

/*
|--------------------------------------------------------------------------
| SEARCH EVENTS
|--------------------------------------------------------------------------
*/
router.get("/search", async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res.status(400).json({
        error: "Search query is required."
      });
    }

    const result = await query(
      `
      SELECT
        e.*,
        c.name AS college_name
      FROM events e
      LEFT JOIN colleges c
        ON e.college_id = c.id
      WHERE
        e.title ILIKE $1
        OR e.description ILIKE $1
        OR e.category ILIKE $1
        OR e.venue ILIKE $1
      ORDER BY e.date ASC
      `,
      [`%${q}%`]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Search events error:", err);
    res.status(500).json({
      error: "Something went wrong searching events."
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET EVENTS BY CATEGORY
|--------------------------------------------------------------------------
*/
router.get("/category/:category", async (req, res) => {
  try {
    const { category } = req.params;

    const result = await query(
      `
      SELECT
        e.*,
        c.name AS college_name
      FROM events e
      LEFT JOIN colleges c
        ON e.college_id = c.id
      WHERE LOWER(e.category) = LOWER($1)
      ORDER BY e.date ASC
      `,
      [category]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get events by category error:", err);
    res.status(500).json({
      error: "Something went wrong fetching events by category."
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET EVENTS BY COLLEGE
|--------------------------------------------------------------------------
*/
router.get("/college/:collegeId", async (req, res) => {
  try {
    const { collegeId } = req.params;

    const result = await query(
      `
      SELECT
        e.*,
        c.name AS college_name
      FROM events e
      LEFT JOIN colleges c
        ON e.college_id = c.id
      WHERE e.college_id = $1
      ORDER BY e.date ASC
      `,
      [collegeId]
    );

    res.json(result.rows);
  } catch (err) {
    console.error("Get college events error:", err);
    res.status(500).json({
      error: "Something went wrong fetching college events."
    });
  }
});

/*
|--------------------------------------------------------------------------
| GET UPCOMING EVENTS
|--------------------------------------------------------------------------
*/
router.get("/upcoming", async (req, res) => {
  try {
    const result = await query(`
      SELECT
        e.*,
        c.name AS college_name
      FROM events e
      LEFT JOIN colleges c
        ON e.college_id = c.id
      WHERE e.date >= NOW()
      ORDER BY e.date ASC
    `);

    res.json(result.rows);
  } catch (err) {
    console.error("Get upcoming events error:", err);
    res.status(500).json({
      error: "Something went wrong fetching upcoming events."
    });
  }
});

/*
|--------------------------------------------------------------------------
| CREATE EVENT
|--------------------------------------------------------------------------
|
| Only a verified admin can create an event.
|
| Flow:
|
| Admin creates event
|       ↓
| Event saved in PostgreSQL
|       ↓
| Find students from same college
|       ↓
| Create notification for each student
|
|--------------------------------------------------------------------------
*/
router.post(
  "/",
  verifyToken,
  requireVerifiedAdmin,
  async (req, res) => {
    try {
      /*
      |--------------------------------------------------------------------------
      | REQUEST BODY
      |--------------------------------------------------------------------------
      */
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

      /*
      |--------------------------------------------------------------------------
      | VALIDATION
      |--------------------------------------------------------------------------
      */
      if (
        !title ||
        !date ||
        !venue ||
        !category ||
        !description ||
        !college_id
      ) {
        return res.status(400).json({
          error:
            "title, date, venue, category, description, and college_id are required."
        });
      }

      /*
      |--------------------------------------------------------------------------
      | CHECK COLLEGE
      |--------------------------------------------------------------------------
      */
      const collegeResult = await query(
        `
        SELECT id, name
        FROM colleges
        WHERE id = $1
        `,
        [Number(college_id)]
      );

      if (collegeResult.rows.length === 0) {
        return res.status(400).json({
          error: "Invalid college_id."
        });
      }

      const college = collegeResult.rows[0];

      /*
      |--------------------------------------------------------------------------
      | ADMIN CAN ONLY CREATE EVENTS FOR THEIR OWN COLLEGE
      |--------------------------------------------------------------------------
      */
      if (
        req.user.college_id !== null &&
        Number(req.user.college_id) !== Number(college_id)
      ) {
        return res.status(403).json({
          error: "You can only create events for your own college."
        });
      }

      /*
      |--------------------------------------------------------------------------
      | CREATE EVENT
      |--------------------------------------------------------------------------
      */
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
          registration_link || null,
          Number(college_id),
          req.user.id
        ]
      );

      const event = eventResult.rows[0];

      /*
      |--------------------------------------------------------------------------
      | FIND STUDENTS FROM SAME COLLEGE
      |--------------------------------------------------------------------------
      */
      const studentsResult = await query(
        `
        SELECT id
        FROM users
        WHERE role = 'student'
        AND college_id = $1
        `,
        [Number(college_id)]
      );

      const studentIds = studentsResult.rows.map(
        (student) => student.id
      );

      /*
      |--------------------------------------------------------------------------
      | CREATE IN-APP NOTIFICATIONS
      |--------------------------------------------------------------------------
      */
      let notificationsCreated = 0;

      if (studentIds.length > 0) {
        const notifications = await createBulkNotifications(
          studentIds,
          {
            type: "new_event",
            title: `New Event: ${event.title}`,
            message: `${college.name} has posted a new event on Circular.`,
            eventId: event.id
          }
        );

        notificationsCreated = notifications.length;
      }

      /*
      |--------------------------------------------------------------------------
      | SUCCESS
      |--------------------------------------------------------------------------
      */
      return res.status(201).json({
        message: "Event created successfully.",
        event,
        notifications_created: notificationsCreated
      });
    } catch (err) {
      console.error("Create event error:", err);

      return res.status(500).json({
        error: "Something went wrong creating the event.",
        details: err.message
      });
    }
  }
);

/*
|--------------------------------------------------------------------------
| GET SINGLE EVENT
|--------------------------------------------------------------------------
*/
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query(
      `
      SELECT
        e.*,
        c.name AS college_name
      FROM events e
      LEFT JOIN colleges c
        ON e.college_id = c.id
      WHERE e.id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: "Event not found."
      });
    }

    res.json(result.rows[0]);
  } catch (err) {
    console.error("Get event error:", err);

    res.status(500).json({
      error: "Something went wrong fetching the event."
    });
  }
});

module.exports = router;