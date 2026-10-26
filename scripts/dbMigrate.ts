import { readdir, readFile } from "fs/promises";
import path from "path";
import { closePool, pool } from "@/lib/db";

// Applies every db/init/*.sql file in order. The files only use IF NOT EXISTS
// statements, so this is safe to re-run against an existing database (e.g. Neon).
async function main() {
  const initDir = path.join(process.cwd(), "db", "init");
  const files = (await readdir(initDir)).filter((name) => name.endsWith(".sql")).sort();

  for (const file of files) {
    const sql = await readFile(path.join(initDir, file), "utf8");
    console.log(`[migrate] Applying ${file}`);
    await pool.query(sql);
  }

  console.log(`[migrate] Done (${files.length} files)`);
}

main()
  .catch((error) => {
    console.error("[migrate] Failed");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
