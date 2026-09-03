const express = require("express");
const { Pool } = require("pg");
const { verifyToken } = require("./middleware/auth");

require("dotenv").config();

const router = express.Router();

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

// ============================================================
// GET /notifications
// Get notifications for logged-in user
// ============================================================

router.get("/", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        id,
        type,
        title,
        message,
        event_id,
        is_read,
        created_at
      FROM notifications
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT 50
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      count: result.rows.length,
      notifications: result.rows
    });

  } catch (error) {
    console.error("❌ Get notifications error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications"
    });
  }
});

// ============================================================
// GET /notifications/unread
// Get unread notification count
// ============================================================

router.get("/unread", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT COUNT(*) AS count
      FROM notifications
      WHERE user_id = $1
      AND is_read = false
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      unread: Number(result.rows[0].count)
    });

  } catch (error) {
    console.error("❌ Unread notification error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch unread notifications"
    });
  }
});

// ============================================================
// PATCH /notifications/:id/read
// Mark one notification as read
// ============================================================

router.patch("/:id/read", verifyToken, async (req, res) => {
  try {
    const notificationId = Number(req.params.id);

    if (!Number.isInteger(notificationId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID"
      });
    }

    const result = await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE id = $1
      AND user_id = $2
      RETURNING id
      `,
      [notificationId, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Notification not found"
      });
    }

    res.json({
      success: true,
      message: "Notification marked as read"
    });

  } catch (error) {
    console.error("❌ Mark notification read error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update notification"
    });
  }
});

// ============================================================
// PATCH /notifications/read-all
// Mark all notifications as read
// ============================================================

router.patch("/read-all", verifyToken, async (req, res) => {
  try {
    await pool.query(
      `
      UPDATE notifications
      SET is_read = true
      WHERE user_id = $1
      AND is_read = false
      `,
      [req.user.id]
    );

    res.json({
      success: true,
      message: "All notifications marked as read"
    });

  } catch (error) {
    console.error("❌ Read all notifications error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update notifications"
    });
  }
});

// ============================================================
// GET /notifications/preferences
// Get notification preferences
// ============================================================

router.get("/preferences", verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      `
      SELECT
        new_events,
        deadline_reminders,
        upcoming_events,
        college_events,
        recommended_events,
        email_notifications,
        push_notifications
      FROM notification_preferences
      WHERE user_id = $1
      `,
      [req.user.id]
    );

    if (result.rows.length === 0) {
      const created = await pool.query(
        `
        INSERT INTO notification_preferences (user_id)
        VALUES ($1)
        RETURNING
          new_events,
          deadline_reminders,
          upcoming_events,
          college_events,
          recommended_events,
          email_notifications,
          push_notifications
        `,
        [req.user.id]
      );

      return res.json({
        success: true,
        preferences: created.rows[0]
      });
    }

    res.json({
      success: true,
      preferences: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Get notification preferences error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch notification preferences"
    });
  }
});

// ============================================================
// PUT /notifications/preferences
// Update notification preferences
// ============================================================

router.put("/preferences", verifyToken, async (req, res) => {
  try {
    const {
      new_events,
      deadline_reminders,
      upcoming_events,
      college_events,
      recommended_events,
      email_notifications,
      push_notifications
    } = req.body;

    const result = await pool.query(
      `
      INSERT INTO notification_preferences
      (
        user_id,
        new_events,
        deadline_reminders,
        upcoming_events,
        college_events,
        recommended_events,
        email_notifications,
        push_notifications
      )
      VALUES
      (
        $1,
        COALESCE($2, true),
        COALESCE($3, true),
        COALESCE($4, true),
        COALESCE($5, true),
        COALESCE($6, true),
        COALESCE($7, false),
        COALESCE($8, false)
      )
      ON CONFLICT (user_id)
      DO UPDATE SET
        new_events = COALESCE(EXCLUDED.new_events, notification_preferences.new_events),
        deadline_reminders = COALESCE(EXCLUDED.deadline_reminders, notification_preferences.deadline_reminders),
        upcoming_events = COALESCE(EXCLUDED.upcoming_events, notification_preferences.upcoming_events),
        college_events = COALESCE(EXCLUDED.college_events, notification_preferences.college_events),
        recommended_events = COALESCE(EXCLUDED.recommended_events, notification_preferences.recommended_events),
        email_notifications = COALESCE(EXCLUDED.email_notifications, notification_preferences.email_notifications),
        push_notifications = COALESCE(EXCLUDED.push_notifications, notification_preferences.push_notifications)
      RETURNING *
      `,
      [
        req.user.id,
        new_events,
        deadline_reminders,
        upcoming_events,
        college_events,
        recommended_events,
        email_notifications,
        push_notifications
      ]
    );

    res.json({
      success: true,
      preferences: result.rows[0]
    });

  } catch (error) {
    console.error("❌ Update notification preferences error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to update notification preferences"
    });
  }
});

module.exports = router;
