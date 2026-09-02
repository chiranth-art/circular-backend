// routes/verification.js
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

router.get("/", requireOwnerSecret, async (req, res) => {
  try {
    const db = await readDB();
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
  } catch (err) {
    console.error("Get verification queue error:", err);
    res.status(500).json({ error: "Something went wrong loading the queue." });
  }
});

router.post("/:id/approve", requireOwnerSecret, async (req, res) => {
  try {
    const db = await readDB();
    const request = db.verificationRequests.find((r) => r.id === Number(req.params.id));

    if (!request) return res.status(404).json({ error: "Request not found." });
    if (request.status !== "pending") return res.status(400).json({ error: `Already ${request.status}.` });

    const user = db.users.find((u) => u.id === request.user_id);
    if (!user) return res.status(404).json({ error: "Associated user not found." });

    user.is_verified = true;
    request.status = "approved";
    await writeDB(db);

    res.json({ message: `${user.full_name} approved. They can now log in and post events.` });
  } catch (err) {
    console.error("Approve error:", err);
    res.status(500).json({ error: "Something went wrong approving this request." });
  }
});

router.post("/:id/reject", requireOwnerSecret, async (req, res) => {
  try {
    const db = await readDB();
    const request = db.verificationRequests.find((r) => r.id === Number(req.params.id));

    if (!request) return res.status(404).json({ error: "Request not found." });
    if (request.status !== "pending") return res.status(400).json({ error: `Already ${request.status}.` });

    request.status = "rejected";
    await writeDB(db);

    res.json({ message: "Request rejected. This user remains unverified and cannot log in as admin." });
  } catch (err) {
    console.error("Reject error:", err);
    res.status(500).json({ error: "Something went wrong rejecting this request." });
  }
});

module.exports = router;