// db.js
// A tiny "database" that just reads/writes a JSON file.
// This is NOT what you'd use in a real production app (that's what
// PostgreSQL/MySQL are for) — but it lets you build and test your auth
// logic today without installing or configuring a real database.
// Swapping this file for a real database later won't change your routes.

const fs = require("fs");
const path = require("path");

const DB_FILE = path.join(__dirname, "data.json");

// If data.json doesn't exist yet, create it with some starter colleges.
function ensureDbExists() {
  if (!fs.existsSync(DB_FILE)) {
    const starterData = {
      colleges: [
        { id: 1, name: "RV College of Engineering (RVCE)", code: "RVCE", domain: "rvce.edu.in" },
        { id: 2, name: "BMS College of Engineering (BMSCE)", code: "BMSCE", domain: "bmsce.ac.in" },
        { id: 3, name: "M S Ramaiah Institute of Technology (MSRIT)", code: "MSRIT", domain: "msrit.edu" },
        { id: 4, name: "Dayananda Sagar College of Engineering (DSCE)", code: "DSCE", domain: "dsce.edu.in" },
        { id: 5, name: "KLE Technological University, Hubli", code: "KLETU", domain: "kletech.ac.in" },
        { id: 6, name: "Siddaganga Institute of Technology, Tumkur", code: "SIT", domain: "sit.ac.in" }
      ],
      users: [],
      verificationRequests: [],
      events: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(starterData, null, 2));
  }
}

// If you already had a data.json from before (without an "events" key),
// this adds it automatically the next time the server reads the file,
// so you don't have to delete your existing test data.
function migrateIfNeeded(data) {
  let changed = false;
  if (!data.events) { data.events = []; changed = true; }
  if (!data.verificationRequests) { data.verificationRequests = []; changed = true; }
  if (changed) writeDB(data);
  return data;
}

function readDB() {
  ensureDbExists();
  const raw = fs.readFileSync(DB_FILE, "utf-8");
  return migrateIfNeeded(JSON.parse(raw));
}

function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = { readDB, writeDB };
