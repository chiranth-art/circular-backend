// server.js
// This is the file you run. It starts the web server and wires up
// the routes. Run it with: node server.js

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth");
const collegeRoutes = require("./routes/colleges");
const eventRoutes = require("./routes/events");
const verificationRoutes = require("./routes/verification");
const statsRoutes = require("./routes/stats");
const bookmarkRoutes = require("./routes/bookmarks");
const notificationRoutes = require("./notifications");
const adminRoutes = require("./routes/admin");

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());          // lets your friend's frontend (different port) call this API
app.use(express.json());  // lets us read JSON request bodies like { "email": "..." }

// A simple route to check the server is alive.
app.get("/", (req, res) => {
  res.json({ status: "Circular backend is running." });
});

app.use("/auth", authRoutes);
app.use("/colleges", collegeRoutes);
app.use("/events", eventRoutes);
app.use("/admin/verification-queue", verificationRoutes);
app.use("/stats", statsRoutes);
app.use("/bookmarks", bookmarkRoutes);
app.use("/notifications", notificationRoutes);
app.use("/admin", adminRoutes);



app.listen(PORT, () => {
  console.log(`Circular backend running on http://localhost:${PORT}`);
});
