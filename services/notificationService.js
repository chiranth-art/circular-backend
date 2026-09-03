const { query } = require("../db");

/**
 * Create an in-app notification for a user.
 *
 * @param {Object} data
 * @param {number} data.userId
 * @param {string} data.type
 * @param {string} data.title
 * @param {string} data.message
 * @param {number|null} data.eventId
 */
async function createNotification({
  userId,
  type,
  title,
  message,
  eventId = null
}) {
  if (!userId) {
    throw new Error("userId is required");
  }

  if (!type) {
    throw new Error("Notification type is required");
  }

  if (!title) {
    throw new Error("Notification title is required");
  }

  if (!message) {
    throw new Error("Notification message is required");
  }

  const result = await query(
    `
    INSERT INTO notifications
    (
      user_id,
      type,
      title,
      message,
      event_id
    )
    VALUES
    ($1, $2, $3, $4, $5)
    RETURNING
      id,
      user_id,
      type,
      title,
      message,
      event_id,
      is_read,
      created_at
    `,
    [
      userId,
      type,
      title,
      message,
      eventId
    ]
  );

  return result.rows[0];
}

module.exports = {
  createNotification
};