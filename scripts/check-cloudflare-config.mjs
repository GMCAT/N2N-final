import { existsSync, readFileSync } from "node:fs";

const placeholder = "00000000-0000-4000-8000-000000000000";
const configPath = new URL("../wrangler.jsonc", import.meta.url);
const outputPath = new URL("../dist/server/wrangler.json", import.meta.url);
const config = readFileSync(configPath, "utf8");

if (config.includes(placeholder)) {
  console.error(
    "Cloudflare deployment stopped: replace the placeholder database_id in wrangler.jsonc with the ID returned by `npx wrangler d1 create n2n-production`.",
  );
  process.exit(1);
}

if (!existsSync(outputPath)) {
  console.error(
    "Cloudflare deployment stopped: production output is missing. Run `npm run build` first.",
  );
  process.exit(1);
}

console.log("Cloudflare production configuration is ready.");
