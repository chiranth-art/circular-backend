// db.js
//
// PostgreSQL is used when DATABASE_URL is available (such as on Render).
// Otherwise, the application falls back to data.json for local development.
//
// Public interface:
//   readDB()
//   writeDB(data)
//
// Data shape:
// {
//   colleges,
//   users,
//   verificationRequests,
//   events,
//   bookmarks
// }

const path = require("path");
const fs = require("fs");

const USE_POSTGRES = !!process.env.DATABASE_URL;

let pool = null;

// ============================================================
// POSTGRES CONNECTION
// ============================================================

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
// DEFAULT COLLEGES
// ============================================================

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
// POSTGRES SCHEMA
// ============================================================

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS colleges (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL,
      domain TEXT,
      city TEXT,
      lat DOUBLE PRECISION,
      lng DOUBLE PRECISION
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
  `);

  // ==========================================================
  // IMPORTANT:
  // Fix existing users table if its ID column does not have
  // automatic ID generation.
  //
  // This is needed because CREATE TABLE IF NOT EXISTS does NOT
  // modify an already-existing table.
  // ==========================================================

  await pool.query(`
    CREATE SEQUENCE IF NOT EXISTS users_id_seq;
  `);

  // Synchronize the sequence with the highest existing user ID.
  await pool.query(`
    SELECT setval(
      'users_id_seq',
      COALESCE((SELECT MAX(id) FROM users), 0) + 1,
      false
    );
  `);

  // Make PostgreSQL automatically generate IDs for new users.
  await pool.query(`
    ALTER TABLE users
    ALTER COLUMN id SET DEFAULT nextval('users_id_seq');
  `);

  // Make the sequence belong to users.id.
  await pool.query(`
    ALTER SEQUENCE users_id_seq
    OWNED BY users.id;
  `);
}

// ============================================================
// SEED DEFAULT COLLEGES
// ============================================================

async function seedCollegesIfEmpty() {
  const { rows } = await pool.query(
    "SELECT COUNT(*) FROM colleges"
  );

  if (Number(rows[0].count) === 0) {
    for (const college of DEFAULT_COLLEGES) {
      await pool.query(
        `
        INSERT INTO colleges
          (name, code, domain, city, lat, lng)
        VALUES
          ($1, $2, $3, $4, $5, $6)
        `,
        [
          college.name,
          college.code,
          college.domain,
          college.city,
          college.lat,
          college.lng
        ]
      );
    }
  }
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
    pool.query(
      "SELECT * FROM verification_requests ORDER BY id"
    ),
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

    for (const user of data.users) {
      if (user.id) {
        await client.query(
          `
          UPDATE users
          SET
            full_name = $1,
            email = $2,
            password_hash = $3,
            role = $4,
            college_id = $5,
            branch = $6,
            year = $7,
            club_name = $8,
            designation = $9,
            is_verified = $10
          WHERE id = $11
          `,
          [
            user.full_name,
            user.email,
            user.password_hash,
            user.role,
            user.college_id || null,
            user.branch || null,
            user.year || null,
            user.club_name || null,
            user.designation || null,
            user.is_verified,
            user.id
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
            ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
          RETURNING id
          `,
          [
            user.full_name,
            user.email,
            user.password_hash,
            user.role,
            user.college_id || null,
            user.branch || null,
            user.year || null,
            user.club_name || null,
            user.designation || null,
            user.is_verified
          ]
        );

        // PostgreSQL-generated ID
        user.id = rows[0].id;
      }
    }

    // --------------------------------------------------------
    // VERIFICATION REQUESTS
    // --------------------------------------------------------

    for (const request of data.verificationRequests) {
      if (request.id) {
        await client.query(
          `
          UPDATE verification_requests
          SET status = $1
          WHERE id = $2
          `,
          [
            request.status,
            request.id
          ]
        );
      } else {
        const { rows } = await client.query(
          `
          INSERT INTO verification_requests
            (user_id, status)
          VALUES
            ($1, $2)
          RETURNING id
          `,
          [
            request.user_id,
            request.status
          ]
        );

        request.id = rows[0].id;
      }
    }

    // --------------------------------------------------------
    // EVENTS
    // --------------------------------------------------------

    for (const event of data.events) {
      if (event.id) {
        await client.query(
          `
          UPDATE events
          SET
            ref_id = $1,
            title = $2,
            date = $3,
            venue = $4,
            category = $5,
            description = $6,
            registration_link = $7,
            college_id = $8,
            posted_by = $9
          WHERE id = $10
          `,
          [
            event.ref_id,
            event.title,
            event.date,
            event.venue,
            event.category,
            event.description || "",
            event.registration_link || "",
            event.college_id || null,
            event.posted_by || null,
            event.id
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
            ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id
          `,
          [
            event.ref_id,
            event.title,
            event.date,
            event.venue,
            event.category,
            event.description || "",
            event.registration_link || "",
            event.college_id || null,
            event.posted_by || null
          ]
        );

        event.id = rows[0].id;
      }
    }

    // --------------------------------------------------------
    // BOOKMARKS
    // --------------------------------------------------------

    for (const bookmark of data.bookmarks) {
      if (bookmark.id) {
        await client.query(
          `
          UPDATE bookmarks
          SET
            user_id = $1,
            event_id = $2
          WHERE id = $3
          `,
          [
            bookmark.user_id,
            bookmark.event_id,
            bookmark.id
          ]
        );
      } else {
        const { rows } = await client.query(
          `
          INSERT INTO bookmarks
            (user_id, event_id)
          VALUES
            ($1, $2)
          RETURNING id
          `,
          [
            bookmark.user_id,
            bookmark.event_id
          ]
        );

        bookmark.id = rows[0].id;
      }
    }

    // --------------------------------------------------------
    // COMMIT
    // --------------------------------------------------------

    await client.query("COMMIT");

  } catch (err) {
    await client.query("ROLLBACK");
    throw err;

  } finally {
    client.release();
  }
}

// ============================================================
// JSON FILE MODE - LOCAL DEVELOPMENT FALLBACK
// ============================================================

const DB_FILE = path.join(__dirname, "data.json");

function ensureDbExistsJSON() {
  if (!fs.existsSync(DB_FILE)) {
    const starterData = {
      colleges: DEFAULT_COLLEGES.map((college, index) => ({
        id: index + 1,
        ...college
      })),

      users: [],

      verificationRequests: [],

      events: [],

      bookmarks: []
    };

    fs.writeFileSync(
      DB_FILE,
      JSON.stringify(starterData, null, 2)
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

  if (!data.colleges) {
    data.colleges = [];
  }

  if (!data.users) {
    data.users = [];
  }

  if (!data.verificationRequests) {
    data.verificationRequests = [];
  }

  if (!data.events) {
    data.events = [];
  }

  if (!data.bookmarks) {
    data.bookmarks = [];
  }

  return data;
}

function writeDBJSON(data) {
  fs.writeFileSync(
    DB_FILE,
    JSON.stringify(data, null, 2)
  );
}

// ============================================================
// PUBLIC INTERFACE
// ============================================================

async function readDB() {
  if (USE_POSTGRES) {
    return readDBPostgres();
  }

  return Promise.resolve(readDBJSON());
}

async function writeDB(data) {
  if (USE_POSTGRES) {
    return writeDBPostgres(data);
  }

  return Promise.resolve(writeDBJSON(data));
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  readDB,
  writeDB
};