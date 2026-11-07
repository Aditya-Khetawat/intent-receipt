import fs from "node:fs";

// Load .env (then .env.local) for CLI scripts, the way `next dev` does for the app.
for (const f of [".env", ".env.local"]) {
  if (fs.existsSync(f)) process.loadEnvFile(f);
}
