const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/apply-migration.cjs <path-to-sql>");
  process.exit(1);
}

const sql = fs.readFileSync(file, "utf8");
// drizzle generates files with `--> statement-breakpoint` separators; split on those
// and on raw `;` for hand-written files. Keep it simple: split on the breakpoint marker.
const statements = sql
  .split(/-->\s*statement-breakpoint/i)
  .map((s) => s.trim())
  .filter((s) => s.length > 0);

const db = new Database("data/athlete-ai.db");
db.pragma("foreign_keys = ON");

console.log(`Applying ${path.basename(file)} — ${statements.length} statement(s)`);

const tx = db.transaction(() => {
  for (const stmt of statements) {
    console.log("  →", stmt.split("\n")[0].slice(0, 80) + (stmt.length > 80 ? "…" : ""));
    db.exec(stmt);
  }
});

try {
  tx();
  console.log("OK");
} catch (e) {
  console.error("FAILED:", e.message);
  process.exit(1);
}
