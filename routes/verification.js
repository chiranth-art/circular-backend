// routes/verification.js
// This handles approving/rejecting college admins whose email domain
// didn't match their college (see auth.js signup/admin logic).
//
// Protection model: instead of building a full "superadmin" user system
// right now, we use one shared secret key that only you (the platform
// owner) know. You send it in a header on every request to this file's
// routes. Simple, and enough for a single-person moderation team.
// Upgrade path later: turn this into a real superadmin role in the users
// table, same pattern as the student/admin roles.

const express = require("express");
const { readDB, writeDB } = require("../db");

const router = express.Router();
const ADMIN_SECRET = process.env.ADMIN_SECRET || "dev-admin-secret-change-this";

function requireOwnerSecret(req, res, next) {
  const provided = req.headers["x-admin-secret"];
  if (!provided || provided !== ADMIN_SECRET) {
    return res.status(401).json({ error: "Missing or incorrect x-admin-secret header." });
  }
  next();
}

// ---------------------------------------------------------------
// GET /admin/verification-queue
// Lists every pending admin signup, with their user details attached
// so you can see who's asking and decide.
// ---------------------------------------------------------------
router.get("/", requireOwnerSecret, (req, res) => {
  const db = readDB();

  const pending = db.verificationRequests
    .filter((r) => r.status === "pending")
    .map((r) => {
      const user = db.users.find((u) => u.id === r.user_id);
      const college = user ? db.colleges.find((c) => c.id === user.college_id) : null;
      return {
        request_id: r.id,
        user_id: r.user_id,
        full_name: user?.full_name,
        email: user?.email,
        club_name: user?.club_name,
        designation: user?.designation,
        college: college?.name,
        requested_at: r.created_at
      };
    });

  res.json(pending);
});

// ---------------------------------------------------------------
// POST /admin/verification-queue/:id/approve
// ---------------------------------------------------------------
router.post("/:id/approve", requireOwnerSecret, (req, res) => {
  const db = readDB();
  const request = db.verificationRequests.find((r) => r.id === Number(req.params.id));

  if (!request) return res.status(404).json({ error: "Request not found." });
  if (request.status !== "pending") return res.status(400).json({ error: `Already ${request.status}.` });

  const user = db.users.find((u) => u.id === request.user_id);
  if (!user) return res.status(404).json({ error: "Associated user not found." });

  user.is_verified = true;
  request.status = "approved";
  writeDB(db);

  res.json({ message: `${user.full_name} approved. They can now log in and post events.` });
});

// ---------------------------------------------------------------
// POST /admin/verification-queue/:id/reject
// ---------------------------------------------------------------
router.post("/:id/reject", requireOwnerSecret, (req, res) => {
  const db = readDB();
  const request = db.verificationRequests.find((r) => r.id === Number(req.params.id));

  if (!request) return res.status(404).json({ error: "Request not found." });
  if (request.status !== "pending") return res.status(400).json({ error: `Already ${request.status}.` });

  request.status = "rejected";
  writeDB(db);

  res.json({ message: "Request rejected. This user remains unverified and cannot log in as admin." });
});

module.exports = router;
