const Database = require("better-sqlite3");
const db = new Database("data/athlete-ai.db");

const tables = db
  .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
  .all();
console.log("=== TABLES ===");
tables.forEach((t) => console.log(" ", t.name));

console.log("\n=== __drizzle_migrations (if any) ===");
try {
  const rows = db
    .prepare(
      "SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY id DESC LIMIT 20"
    )
    .all();
  rows.forEach((r) => console.log(JSON.stringify(r)));
  if (rows.length === 0) console.log("(empty)");
} catch (e) {
  console.log("ERR:", e.message);
}
