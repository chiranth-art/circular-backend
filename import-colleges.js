const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { parse } = require("csv-parse/sync");

require("dotenv").config();

if (!process.env.DATABASE_URL) {
  console.error("❌ DATABASE_URL is not set.");
  console.error("Make sure your .env contains your Render PostgreSQL DATABASE_URL.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const CSV_FILE = path.join(
  __dirname,
  "vtu_affiliated_colleges.csv"
);

function extractDomain(website) {
  if (!website) return null;

  try {
    let url = website.trim();

    if (
      !url.startsWith("http://") &&
      !url.startsWith("https://")
    ) {
      url = "https://" + url;
    }

    return new URL(url)
      .hostname
      .replace(/^www\./, "")
      .toLowerCase();

  } catch {
    return null;
  }
}

async function main() {
  console.log("=================================");
  console.log("VTU COLLEGE CSV IMPORT");
  console.log("=================================");

  if (!fs.existsSync(CSV_FILE)) {
    console.error("❌ CSV file not found:");
    console.error(CSV_FILE);
    process.exit(1);
  }

  console.log("📄 Reading CSV...");

  const csvText = fs.readFileSync(
    CSV_FILE,
    "utf8"
  );

  const colleges = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
    trim: true
  });

  console.log(`📚 Found ${colleges.length} colleges.`);
  console.log("");

  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Make sure the new columns exist.
    await client.query(`
      ALTER TABLE colleges
      ADD COLUMN IF NOT EXISTS website TEXT,
      ADD COLUMN IF NOT EXISTS std_code TEXT,
      ADD COLUMN IF NOT EXISTS phone TEXT,
      ADD COLUMN IF NOT EXISTS rural_urban TEXT
    `);

    let imported = 0;
    let skipped = 0;

    for (const college of colleges) {

      const name =
        college["College Name"]?.trim();

      const code =
        college["Code"]?.trim();

      const region =
        college["Region"]?.trim() || null;

      const website =
        college["Website"]?.trim() || null;

      const stdCode =
        college["STD Code"]?.trim() || null;

      const phone =
        college["Phone"]?.trim() || null;

      const ruralUrban =
        college["Rural/Urban"]?.trim() || null;

      if (!name || !code) {
        console.log(
          "⚠️ Skipping row without college name/code."
        );

        skipped++;
        continue;
      }

      const domain =
        extractDomain(website);

      await client.query(
        `
        INSERT INTO colleges
        (
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
        )
        VALUES
        (
          $1,
          $2,
          $3,
          $4,
          NULL,
          NULL,
          $5,
          $6,
          $7,
          $8
        )
        ON CONFLICT (code)
        DO UPDATE SET
          name = EXCLUDED.name,
          domain = EXCLUDED.domain,
          city = EXCLUDED.city,
          website = EXCLUDED.website,
          std_code = EXCLUDED.std_code,
          phone = EXCLUDED.phone,
          rural_urban = EXCLUDED.rural_urban
        `,
        [
          name,
          code,
          domain,
          region,
          website,
          stdCode,
          phone,
          ruralUrban
        ]
      );

      imported++;

      console.log(
        `✅ ${imported}. ${code} - ${name}`
      );
    }

    await client.query("COMMIT");

    console.log("");
    console.log("=================================");
    console.log("✅ IMPORT COMPLETED");
    console.log("=================================");
    console.log(`Imported/updated: ${imported}`);
    console.log(`Skipped: ${skipped}`);
    console.log("=================================");

  } catch (error) {

    await client.query("ROLLBACK");

    console.error("");
    console.error("❌ IMPORT FAILED");
    console.error(error);

    process.exitCode = 1;

  } finally {

    client.release();

    await pool.end();
  }
}

main();