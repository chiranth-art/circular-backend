// db.js
// Database layer for Circular backend.
//
// If DATABASE_URL is set:
//   → Uses PostgreSQL (Render)
//
// If DATABASE_URL is NOT set:
//   → Falls back to local data.json
//
// Both modes expose the same interface:
//   readDB()
//   writeDB(data)

const path = require("path");
const fs = require("fs");

const USE_POSTGRES = !!process.env.DATABASE_URL;

let pool = null;

if (USE_POSTGRES) {
  const { Pool } = require("pg");

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });
}

// ============================================================
// POSTGRESQL SCHEMA
// ============================================================

async function initSchema() {
  // Create all required tables
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colleges (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT UNIQUE NOT NULL,
      domain TEXT,
      city TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION,
      website TEXT,
      std_code TEXT,
      phone TEXT,
      rural_urban TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      college_id INTEGER REFERENCES colleges(id),
      branch TEXT,
      year TEXT,
      club_name TEXT,
      designation TEXT,
      is_verified BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS verification_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS events (
      id SERIAL PRIMARY KEY,
      ref_id TEXT,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      venue TEXT NOT NULL,
      category TEXT NOT NULL,
      description TEXT DEFAULT '',
      registration_link TEXT DEFAULT '',
      college_id INTEGER REFERENCES colleges(id),
      posted_by INTEGER REFERENCES users(id),
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      event_id INTEGER REFERENCES events(id),
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
      is_read BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id SERIAL PRIMARY KEY,
      user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      new_events BOOLEAN DEFAULT true,
      deadline_reminders BOOLEAN DEFAULT true,
      upcoming_events BOOLEAN DEFAULT true,
      college_events BOOLEAN DEFAULT true,
      recommended_events BOOLEAN DEFAULT true,
      email_notifications BOOLEAN DEFAULT false,
      push_notifications BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ DEFAULT now(),
      updated_at TIMESTAMPTZ DEFAULT now()
    );
  `);

  // ----------------------------------------------------------
  // Add new college columns to an existing database.
  //
  // This is important because CREATE TABLE IF NOT EXISTS
  // does NOT modify a table that already exists.
  // ----------------------------------------------------------

  await pool.query(`
    ALTER TABLE colleges
    ADD COLUMN IF NOT EXISTS website TEXT,
    ADD COLUMN IF NOT EXISTS std_code TEXT,
    ADD COLUMN IF NOT EXISTS phone TEXT,
    ADD COLUMN IF NOT EXISTS rural_urban TEXT
  `);
}

// ============================================================
// OLD DEFAULT COLLEGES
// ============================================================
//
// These are kept for local JSON fallback compatibility.
//
// We will import your complete VTU CSV separately into
// PostgreSQL using import-colleges.js.
//
//

const DEFAULT_COLLEGES = [
  {
    name: "RV College of Engineering (RVCE)",
    code: "RVCE",
    domain: "rvce.edu.in",
    city: "Bengaluru",
    lat: 12.9237,
    lng: 77.4975
  },
  {
    name: "BMS College of Engineering (BMSCE)",
    code: "BMSCE",
    domain: "bmsce.ac.in",
    city: "Bengaluru",
    lat: 12.9415,
    lng: 77.5661
  },
  {
    name: "M S Ramaiah Institute of Technology (MSRIT)",
    code: "MSRIT",
    domain: "msrit.edu",
    city: "Bengaluru",
    lat: 13.0358,
    lng: 77.5645
  },
  {
    name: "Dayananda Sagar College of Engineering (DSCE)",
    code: "DSCE",
    domain: "dsce.edu.in",
    city: "Bengaluru",
    lat: 12.9083,
    lng: 77.5666
  },
  {
    name: "KLE Technological University, Hubli",
    code: "KLETU",
    domain: "kletech.ac.in",
    city: "Hubli",
    lat: 15.3355,
    lng: 75.13
  },
  {
    name: "Siddaganga Institute of Technology, Tumkur",
    code: "SIT",
    domain: "sit.ac.in",
    city: "Tumkur",
    lat: 13.3379,
    lng: 77.1173
  }
];

// ============================================================
// SEED DEFAULT COLLEGES
// ============================================================
//
// IMPORTANT:
// For PostgreSQL, your 185-college CSV will be imported using
// import-colleges.js.
//
// Therefore we do NOT automatically insert the old 6 colleges
// into PostgreSQL.
//
// The 6 colleges are still used by the local data.json fallback.
//

async function seedCollegesIfEmpty() {
  // CSV import will handle PostgreSQL colleges.
  return;
}

// ============================================================
// READ DATABASE - POSTGRESQL
// ============================================================

async function readDBPostgres() {
  await initSchema();
  await seedCollegesIfEmpty();

  const [
    colleges,
    users,
    verificationRequests,
    events,
    bookmarks
  ] = await Promise.all([
    pool.query("SELECT * FROM colleges ORDER BY id"),
    pool.query("SELECT * FROM users ORDER BY id"),
    pool.query("SELECT * FROM verification_requests ORDER BY id"),
    pool.query("SELECT * FROM events ORDER BY id"),
    pool.query("SELECT * FROM bookmarks ORDER BY id")
  ]);

  return {
    colleges: colleges.rows,
    users: users.rows,
    verificationRequests: verificationRequests.rows,
    events: events.rows,
    bookmarks: bookmarks.rows
  };
}

// ============================================================
// WRITE DATABASE - POSTGRESQL
// ============================================================

async function writeDBPostgres(data) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // --------------------------------------------------------
    // USERS
    // --------------------------------------------------------

    for (const u of data.users) {
      if (u.id) {
        await client.query(
          `
          UPDATE users
          SET
            full_name=$1,
            email=$2,
            password_hash=$3,
            role=$4,
            college_id=$5,
            branch=$6,
            year=$7,
            club_name=$8,
            designation=$9,
            is_verified=$10
          WHERE id=$11
          `,
          [
            u.full_name,
            u.email,
            u.password_hash,
            u.role,
            u.college_id || null,
            u.branch || null,
            u.year || null,
            u.club_name || null,
            u.designation || null,
            u.is_verified,
            u.id
          ]
        );
      } else {
        const { rows } = await client.query(
          `
          INSERT INTO users
          (
            full_name,
            email,
            password_hash,
            role,
            college_id,
            branch,
            year,
            club_name,
            designation,
            is_verified
          )
          VALUES
          ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
          RETURNING id
          `,
          [
            u.full_name,
            u.email,
            u.password_hash,
            u.role,
            u.college_id || null,
            u.branch || null,
            u.year || null,
            u.club_name || null,
            u.designation || null,
            u.is_verified
          ]
        );

        u.id = rows[0].id;
      }
    }

    // --------------------------------------------------------
    // VERIFICATION REQUESTS
    // --------------------------------------------------------

    for (const r of data.verificationRequests) {
      if (r.id) {
        await client.query(
          `
          UPDATE verification_requests
          SET status=$1
          WHERE id=$2
          `,
          [
            r.status,
            r.id
          ]
        );
      } else {
        const { rows } = await client.query(
          `
          INSERT INTO verification_requests
          (user_id, status)
          VALUES ($1,$2)
          RETURNING id
          `,
          [
            r.user_id,
            r.status
          ]
        );

        r.id = rows[0].id;
      }
    }

    // --------------------------------------------------------
    // EVENTS
    // --------------------------------------------------------

    for (const e of data.events) {
      if (e.id) {
        await client.query(
          `
          UPDATE events
          SET
            ref_id=$1,
            title=$2,
            date=$3,
            venue=$4,
            category=$5,
            description=$6,
            registration_link=$7
          WHERE id=$8
          `,
          [
            e.ref_id,
            e.title,
            e.date,
            e.venue,
            e.category,
            e.description || "",
            e.registration_link || "",
            e.id
          ]
        );
      } else {
        const { rows } = await client.query(
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
          RETURNING id
          `,
          [
            e.ref_id,
            e.title,
            e.date,
            e.venue,
            e.category,
            e.description || "",
            e.registration_link || "",
            e.college_id,
            e.posted_by
          ]
        );

        e.id = rows[0].id;
      }
    }

    // --------------------------------------------------------
    // BOOKMARKS
    // --------------------------------------------------------

    for (const b of data.bookmarks) {
      if (!b.id) {
        const { rows } = await client.query(
          `
          INSERT INTO bookmarks
          (user_id, event_id)
          VALUES ($1,$2)
          RETURNING id
          `,
          [
            b.user_id,
            b.event_id
          ]
        );

        b.id = rows[0].id;
      }
    }

    // Remove bookmarks that no longer exist in the data object
    const {
      rows: allBookmarkRows
    } = await client.query(
      "SELECT id FROM bookmarks"
    );

    const keepIds = new Set(
      data.bookmarks.map((b) => b.id)
    );

    for (const row of allBookmarkRows) {
      if (!keepIds.has(row.id)) {
        await client.query(
          "DELETE FROM bookmarks WHERE id=$1",
          [row.id]
        );
      }
    }

    await client.query("COMMIT");

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;

  } finally {
    client.release();
  }
}

// ============================================================
// LOCAL JSON DATABASE
// ============================================================

const DB_FILE = path.join(
  __dirname,
  "data.json"
);

function ensureDbExistsJSON() {
  if (!fs.existsSync(DB_FILE)) {
    const starterData = {
      colleges: DEFAULT_COLLEGES.map(
        (c, i) => ({
          id: i + 1,
          ...c
        })
      ),

      users: [],

      verificationRequests: [],

      events: [],

      bookmarks: []
    };

    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(
        starterData,
        null,
        2
      )
    );
  }
}

function readDBJSON() {
  ensureDbExistsJSON();

  const raw = fs.readFileSync(
    DB_FILE,
    "utf-8"
  );

  const data = JSON.parse(raw);

  if (!data.bookmarks) {
    data.bookmarks = [];
  }

  return data;
}

function writeDBJSON(data) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(
      data,
      null,
      2
    )
  );
}

// ============================================================
// PUBLIC DATABASE FUNCTIONS
// ============================================================

async function readDB() {
  if (USE_POSTGRES) {
    return readDBPostgres();
  }

  return Promise.resolve(
    readDBJSON()
  );
}

async function writeDB(data) {
  if (USE_POSTGRES) {
    return writeDBPostgres(data);
  }

  return Promise.resolve(
    writeDBJSON(data)
  );
}

// ============================================================
// DIRECT SQL QUERY
// ============================================================
//
// Used by services such as notificationService.js.
//
// This uses the SAME PostgreSQL pool created above.
// We do not create another Pool in individual services.
//

async function query(text, params = []) {
  if (!USE_POSTGRES) {
    throw new Error(
      "Direct SQL queries require PostgreSQL"
    );
  }

  return pool.query(
    text,
    params
  );
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  readDB,
  writeDB,
  query
};