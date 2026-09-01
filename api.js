// api.js
// Give this file to your frontend friend. They import these functions
// instead of writing raw fetch() calls themselves — it keeps the URLs
// and field names consistent with the actual backend.

// CHANGE THIS to your live backend URL.
// This is now permanent — Render, not a temporary ngrok tunnel.
const BASE_URL = "https://circular-backend-t3mk.onrender.com";

// Get the list of colleges (for signup dropdowns)
export async function getColleges() {
  const res = await fetch(`${BASE_URL}/colleges`);
  if (!res.ok) throw new Error("Failed to load colleges");
  return res.json(); // [{ id, name, code }, ...]
}

// Get homepage stats and category counts — all real numbers.
export async function getStats() {
  const res = await fetch(`${BASE_URL}/stats`);
  if (!res.ok) throw new Error("Failed to load stats");
  return res.json(); // { total_colleges, total_events, categories: [{ category, count }] }
}

// Sign up a student
export async function signupStudent({ full_name, email, password, college_id, branch, year }) {
  const res = await fetch(`${BASE_URL}/auth/signup/student`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name, email, password, college_id, branch, year })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Signup failed");
  return data; // { message, user_id }
}

// Sign up a college admin / club
export async function signupAdmin({ full_name, email, password, college_id, club_name, designation }) {
  const res = await fetch(`${BASE_URL}/auth/signup/admin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ full_name, email, password, college_id, club_name, designation })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Signup failed");
  return data; // { message, user_id, is_verified }
}

// Log in (works for both students and admins)
export async function login({ email, password }) {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Login failed");
  return data; // { token, user: { id, full_name, email, role, college_id } }
}

// Get events for the browse page. All filters are optional.
// Example: getEvents({ category: "Hackathon", search: "robotics" })
// This ALSO powers the search bar and category tiles — same function,
// just called with different filters.
//
// For "near me": pass { lat, lng } (see getStudentLocation() below to
// get these from the browser). Every event comes back with a
// distance_km field and the list is sorted nearest-first automatically.
export async function getEvents({ college_id, category, search, lat, lng } = {}) {
  const params = new URLSearchParams();
  if (college_id) params.append("college_id", college_id);
  if (category) params.append("category", category);
  if (search) params.append("search", search);
  if (lat !== undefined && lng !== undefined) {
    params.append("lat", lat);
    params.append("lng", lng);
  }

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${BASE_URL}/events${query}`);
  if (!res.ok) throw new Error("Failed to load events");
  return res.json(); // [{ id, ref_id, title, date, venue, category, description, registration_link, college_name, college_city, distance_km?, ... }]
}

// Asks the BROWSER for the student's current location (this triggers
// the "Allow this site to know your location?" permission popup).
// This is a frontend-only concern — your backend never sees raw GPS
// data unless the frontend explicitly sends it as lat/lng, like above.
// Usage: const { lat, lng } = await getStudentLocation();
export function getStudentLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation isn't supported in this browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        });
      },
      (err) => {
        reject(new Error("Location permission denied or unavailable."));
      }
    );
  });
}

// Post a new event. Only works if the logged-in user is a VERIFIED admin.
// `token` is the string you got back from login() — pass it in here.
export async function postEvent(token, { title, date, venue, category, description, registration_link }) {
  const res = await fetch(`${BASE_URL}/events`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ title, date, venue, category, description, registration_link })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Failed to publish event");
  return data; // { message, event: { id, ref_id, title, ... } }
}