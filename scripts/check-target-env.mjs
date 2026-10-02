// Guard used right after `astro build` (same idea as the grep in the company Jenkinsfile).
// A missing / wrong CLOUDFLARE_ENV does NOT fail the build — the adapter silently falls back
// to the top-level config (no pinned KV id -> a fresh, cold, unshared namespace).
import { readFileSync } from 'node:fs';

const expected = process.env.CLOUDFLARE_ENV;
const path = 'dist/server/wrangler.json';

if (!expected) {
  console.error('CLOUDFLARE_ENV is not set (expected develop | branch | release)');
  process.exit(1);
}
let actual;
try {
  actual = JSON.parse(readFileSync(path, 'utf8')).targetEnvironment;
} catch (e) {
  console.error(`Cannot read ${path} — did the build run? (${e.message})`);
  process.exit(1);
}
if (actual !== expected) {
  console.error(`Build resolved to targetEnvironment=${actual ?? '(none)'}, expected ${expected}`);
  process.exit(1);
}
console.log(`OK: dist/server/wrangler.json targetEnvironment=${actual}`);
