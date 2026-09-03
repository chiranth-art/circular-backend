const express = require("express");
const { Pool } = require("pg");

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

// GET /colleges
// Returns all colleges from PostgreSQL
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT id, name, code, domain, city, lat, lng, website, std_code, phone, rural_urban FROM colleges ORDER BY name ASC"
    );

    res.json({
      success: true,
      count: result.rows.length,
      colleges: result.rows
    });
  } catch (error) {
    console.error("❌ Get colleges error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch colleges"
    });
  }
});

// GET /colleges/search?q=RV
// Search colleges by name, code or city
router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query is required"
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        code,
        domain,
        city,
        lat,
        lng,
        website,
        std_code,
        phone,
        rural_urban
      FROM colleges
      WHERE
        name ILIKE $1
        OR code ILIKE $1
        OR city ILIKE $1
      ORDER BY name ASC
      LIMIT 50
      `,
      [`%${q}%`]
    );

    res.json({
      success: true,
      count: result.rows.length,
      colleges: result.rows
    });
  } catch (error) {
    console.error("❌ College search error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to search colleges"
    });
  }
});

// GET /colleges/city/:city
// Returns colleges in a particular city
router.get("/city/:city", async (req, res) => {
  try {
    const city = req.params.city.trim();

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        code,
        domain,
        city,
        lat,
        lng,
        website,
        std_code,
        phone,
        rural_urban
      FROM colleges
      WHERE city ILIKE $1
      ORDER BY name ASC
      `,
      [city]
    );

    res.json({
      success: true,
      count: result.rows.length,
      colleges: result.rows
    });
  } catch (error) {
    console.error("❌ City colleges error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch colleges"
    });
  }
});

// GET /colleges/:id
// Returns one college
router.get("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid college ID"
      });
    }

    const result = await pool.query(
      `
      SELECT
        id,
        name,
        code,
        domain,
        city,
        lat,
        lng,
        website,
        std_code,
        phone,
        rural_urban
      FROM colleges
      WHERE id = $1
      `,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "College not found"
      });
    }

    res.json({
      success: true,
      college: result.rows[0]
    });
  } catch (error) {
    console.error("❌ Single college error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch college"
    });
  }
});

module.exports = router;

