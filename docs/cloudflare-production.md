# N2N v1.3.1 — Cloudflare Production Deployment

This package targets Cloudflare Workers with a D1 database. Live messages and
files travel peer-to-peer over WebRTC; D1 stores only short-lived room,
pairing, queue, quota, and signaling records.

## 1. Create the production D1 database

From a local terminal authenticated with the same Cloudflare account:

```bash
npx wrangler login
npx wrangler d1 create n2n-production
```

Copy the returned `database_id` into `wrangler.jsonc`, replacing:

```text
00000000-0000-4000-8000-000000000000
```

Commit and push that change to GitHub. A D1 database ID is an identifier, not a
secret. Never commit an API token.

## 2. Apply the schema

```bash
npm install
npm run db:migrate:production
```

Run this again after a release adds a new migration.

## 3. Configure Cloudflare Workers Builds

Use these settings in **Workers & Pages > n2n > Settings > Builds**:

```text
Build command:  npm run build
Deploy command: npm run deploy:cloudflare
Root directory: /
```

Node.js 22 or newer is required. Do not add a Cloudflare API token to the
repository; use the build token managed by Cloudflare.

## 4. Deploy

Push to the connected GitHub branch, or deploy locally:

```bash
npm run build
npm run deploy:cloudflare
```

The deploy command intentionally stops with a clear error while the placeholder
D1 database ID remains in `wrangler.jsonc`.

The first public URL will be similar to `https://n2n.<account>.workers.dev`.

## 5. Production checks

Open two browsers or profiles and verify:

1. The sender creates an eight-digit pairing code.
2. The receiver joins with the two four-digit groups.
3. Both sides show online and E2E verified.
4. Text transfers in both directions.
5. A file transfers in both directions without appearing in D1.
6. Leaving closes the room and releases its slot.

## Free-plan safety

The application limits room creation to 1,000 requests per UTC day, active
rooms to 1,024, and the waiting queue to 25. These are application guards, not
a substitute for Cloudflare account-level request limits or abuse protection.
STUN is configured without TURN, so restrictive networks may fail to connect
instead of relaying file traffic through a paid service.
