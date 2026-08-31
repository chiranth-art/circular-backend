// api.js
// Give this file to your frontend friend. They import these functions
// instead of writing raw fetch() calls themselves — it keeps the URLs
// and field names consistent with the actual backend.

// CHANGE THIS to your ngrok URL while testing together,
// e.g. "https://a1b2-3c4d.ngrok-free.app"
// Once the backend is properly deployed later, it changes once more
// (e.g. to "https://circular-backend.up.railway.app") — nothing else
// in this file needs to change.
const BASE_URL = "http://localhost:4000";

// Get the list of colleges (for signup dropdowns)
export async function getColleges() {
  const res = await fetch(`${BASE_URL}/colleges`);
  if (!res.ok) throw new Error("Failed to load colleges");
  return res.json(); // [{ id, name, code }, ...]
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
export async function getEvents({ college_id, category, search } = {}) {
  const params = new URLSearchParams();
  if (college_id) params.append("college_id", college_id);
  if (category) params.append("category", category);
  if (search) params.append("search", search);

  const query = params.toString() ? `?${params.toString()}` : "";
  const res = await fetch(`${BASE_URL}/events${query}`);
  if (!res.ok) throw new Error("Failed to load events");
  return res.json(); // [{ id, ref_id, title, date, venue, category, description, registration_link, college_name, ... }]
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

/*
Example usage in a form's submit handler:

import { signupStudent } from "./api.js";

async function handleSignup(formData) {
  try {
    const result = await signupStudent({
      full_name: formData.name,
      email: formData.email,
      password: formData.password,
      college_id: Number(formData.collegeId),
      branch: formData.branch,
      year: formData.year
    });
    console.log("Signed up:", result);
    // redirect to a "check your account" or login page
  } catch (err) {
    alert(err.message); // shows "An account with this email already exists." etc.
  }
}

After login, save the token somewhere the app can reuse it for future
requests that need auth (e.g. posting an event). In plain JS/React,
keep it in memory (a variable or state) rather than localStorage where
possible, since this project avoids browser storage in some environments.

Example: posting an event after login (only works if the user is a
verified admin — students and unverified admins will get an error).

import { login, postEvent } from "./api.js";

async function handlePostEvent(loginToken, eventForm) {
  try {
    const result = await postEvent(loginToken, {
      title: eventForm.title,
      date: eventForm.date,
      venue: eventForm.venue,
      category: eventForm.category,
      description: eventForm.description,
      registration_link: eventForm.link
    });
    console.log("Published:", result.event.ref_id);
  } catch (err) {
    alert(err.message); // e.g. "Your admin account isn't verified yet."
  }
}
*/
