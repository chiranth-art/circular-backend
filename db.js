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
// Each college has real (approximate) coordinates so distance-based
// "near you" search actually works.
function ensureDbExists() {
  if (!fs.existsSync(DB_FILE)) {
    const starterData = {
      colleges: [
        { id: 1, name: "RV College of Engineering (RVCE)", code: "RVCE", domain: "rvce.edu.in", city: "Bengaluru", lat: 12.9237, lng: 77.4975 },
        { id: 2, name: "BMS College of Engineering (BMSCE)", code: "BMSCE", domain: "bmsce.ac.in", city: "Bengaluru", lat: 12.9415, lng: 77.5661 },
        { id: 3, name: "M S Ramaiah Institute of Technology (MSRIT)", code: "MSRIT", domain: "msrit.edu", city: "Bengaluru", lat: 13.0358, lng: 77.5645 },
        { id: 4, name: "Dayananda Sagar College of Engineering (DSCE)", code: "DSCE", domain: "dsce.edu.in", city: "Bengaluru", lat: 12.9083, lng: 77.5666 },
        { id: 5, name: "KLE Technological University, Hubli", code: "KLETU", domain: "kletech.ac.in", city: "Hubli", lat: 15.3355, lng: 75.1300 },
        { id: 6, name: "Siddaganga Institute of Technology, Tumkur", code: "SIT", domain: "sit.ac.in", city: "Tumkur", lat: 13.3379, lng: 77.1173 }
      ],
      users: [],
      verificationRequests: [],
      events: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(starterData, null, 2));
  }
}

// Coordinates for colleges that might already exist in an older data.json
// without lat/lng — matched by college code.
const COLLEGE_COORDS = {
  RVCE: { city: "Bengaluru", lat: 12.9237, lng: 77.4975 },
  BMSCE: { city: "Bengaluru", lat: 12.9415, lng: 77.5661 },
  MSRIT: { city: "Bengaluru", lat: 13.0358, lng: 77.5645 },
  DSCE: { city: "Bengaluru", lat: 12.9083, lng: 77.5666 },
  KLETU: { city: "Hubli", lat: 15.3355, lng: 75.1300 },
  SIT: { city: "Tumkur", lat: 13.3379, lng: 77.1173 },
  NMAMIT: { city: "Nitte", lat: 13.1725, lng: 74.9235 },
  JSSSTU: { city: "Mysuru", lat: 12.3052, lng: 76.6206 },
  BIT: { city: "Bengaluru", lat: 12.9698, lng: 77.5896 },
  SDMCET: { city: "Dharwad", lat: 15.4589, lng: 75.0078 }
};

// If you already had a data.json from before (missing newer fields),
// this fills them in automatically the next time the server reads the
// file, so you don't have to delete your existing test data.
function migrateIfNeeded(data) {
  let changed = false;
  if (!data.events) { data.events = []; changed = true; }
  if (!data.verificationRequests) { data.verificationRequests = []; changed = true; }

  data.colleges.forEach((c) => {
    if (c.lat === undefined || c.lng === undefined) {
      const coords = COLLEGE_COORDS[c.code];
      if (coords) {
        c.city = coords.city;
        c.lat = coords.lat;
        c.lng = coords.lng;
        changed = true;
      }
    }
  });

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