require("dotenv").config();

const { query } = require("./db");

async function verifyTestAdmin() {
  try {
    const result = await query(
      `
      UPDATE users
      SET is_verified = true
      WHERE id = $1
      RETURNING
        id,
        full_name,
        email,
        role,
        college_id,
        is_verified
      `,
      [5]
    );

    if (result.rows.length === 0) {
      console.log("Admin user with ID 5 was not found.");
      process.exit(1);
    }

    console.log("Admin verified successfully:");
    console.log(result.rows[0]);

    process.exit(0);
  } catch (error) {
    console.error("Verification failed:");
    console.error(error);

    process.exit(1);
  }
}

verifyTestAdmin();