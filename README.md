# Circular Backend — Starter

This is a working authentication API: student signup, college-admin signup
(with domain-based verification), and login. It's tested and runs as-is.

## 1. Install Node.js
Download from https://nodejs.org (LTS version). Confirm it worked:
```
node -v
npm -v
```

## 2. Install this project's dependencies
Open a terminal in this folder and run:
```
npm install
```

## 3. Set up your environment file
```
cp .env.example .env
```
Open `.env` and change `JWT_SECRET` to any long random string.

## 4. Run the server
```
node server.js
```
You should see: `Circular backend running on http://localhost:4000`

## 5. Test it
With the server running, open a new terminal and try:

```bash
# See the list of colleges
curl http://localhost:4000/colleges

# Sign up a student
curl -X POST http://localhost:4000/auth/signup/student \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Asha Rao","email":"asha@gmail.com","password":"pass1234","college_id":1,"branch":"CSE","year":2}'

# Sign up an admin whose email domain matches their college -> auto-verified
curl -X POST http://localhost:4000/auth/signup/admin \
  -H "Content-Type: application/json" \
  -d '{"full_name":"Prof Kumar","email":"kumar@rvce.edu.in","password":"pass1234","college_id":1,"club_name":"IEEE Chapter"}'

# Log in
curl -X POST http://localhost:4000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"asha@gmail.com","password":"pass1234"}'
```

You can also test with a tool like Postman or Thunder Client (VS Code
extension) instead of curl, if that's easier to visualize.

## How it stores data right now
`data.json` (created automatically the first time you run the server)
holds everything — colleges, users, pending verification requests. This
is intentional for learning: no database setup required to get started.
When you're ready, swap `db.js` for real PostgreSQL calls — none of your
route files need to change, since they only ever call `readDB()` /
`writeDB()`.

## What's next
- Give your frontend friend the `/auth/*`, `/colleges`, and `/events` endpoints
  so they can wire up the sign-in page and events board against real
  responses
- Deploy this to Render or Railway so it's a permanent live URL, not
  dependent on your laptop being on

## Admin verification queue

Admins whose email domain doesn't match their college get created but
blocked from logging in until approved. These routes handle that, and
are protected by one shared secret (`ADMIN_SECRET` in your `.env`) that
only you know — send it as a header called `x-admin-secret`.

```bash
# See who's waiting for approval
curl http://localhost:4000/admin/verification-queue \
  -H "x-admin-secret: YOUR_SECRET_HERE"

# Approve a specific request (use the request_id from the list above)
curl -X POST http://localhost:4000/admin/verification-queue/1/approve \
  -H "x-admin-secret: YOUR_SECRET_HERE"

# Or reject one
curl -X POST http://localhost:4000/admin/verification-queue/1/reject \
  -H "x-admin-secret: YOUR_SECRET_HERE"
```

Once approved, that admin can log in and post events immediately.

