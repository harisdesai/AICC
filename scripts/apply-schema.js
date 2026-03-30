"use strict";

require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("Set DATABASE_URL in .env (see .env.example)");
    process.exit(1);
  }
  const sqlPath = path.join(__dirname, "..", "db", "schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(sql);
    console.log("Applied db/schema.sql successfully.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  if (err.code === "ECONNREFUSED") {
    console.error("Cannot reach PostgreSQL. Start it first (e.g. Docker Desktop → docker compose up -d in this folder), then try again.");
  } else if (err.code === "3D000") {
    console.error('Database in DATABASE_URL does not exist. Create it (e.g. CREATE DATABASE aicc;) then rerun.');
  } else {
    console.error(err.message || err);
  }
  process.exit(1);
});
