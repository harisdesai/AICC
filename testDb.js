require("dotenv").config();
const { Client } = require("pg");
const db = new Client({ connectionString: process.env.DATABASE_URL });
(async () => {
  await db.connect();
  const users = await db.query("SELECT * FROM users");
  console.log("Users:", users.rows);
  const sessions = await db.query("SELECT * FROM interview_sessions");
  console.log("Sessions:", sessions.rows);
  await db.end();
})();
