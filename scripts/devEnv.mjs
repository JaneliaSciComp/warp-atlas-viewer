// Tiny .env.local loader shared by vite.config.ts (the app) and
// docs/.vitepress/config.ts (the documentation site). Lets you keep
// per-developer settings — like dev-server allowed hostnames — out
// of the repo without pulling in a dotenv dependency.
//
// Loads `.env.local` from the repo root (CWD when npm runs the script)
// if it exists, then derives any structured values we care about. Lines
// already set in the real environment win, so CI / shell exports can
// override the file.

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve(process.cwd(), '.env.local');
if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, 'utf8').split('\n')) {
    // KEY=value, ignore blanks and `#`-comments. Quotes (single or
    // double) around the value are stripped if balanced.
    const m = raw.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    let [, key, value] = m;
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

/** Allowed dev-server hostnames. Comma-separated in WARP_ALLOWED_HOSTS;
 *  defaults to just localhost so a fresh clone with no .env.local is
 *  still usable. */
export const allowedHosts = (process.env.WARP_ALLOWED_HOSTS ?? 'localhost')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
