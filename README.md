# N2N

N2N v1.3.7 is an end-to-end encrypted browser file-transfer service. In the
live pairing flow, plaintext files and decryption keys stay on the sender and
recipient devices. The server stores only short-lived pairing and signaling
state.

The project uses [vinext](https://github.com/cloudflare/vinext) on Cloudflare
Workers, with D1 for short-lived pairing and signaling state. WebRTC carries
live messages and files directly between browsers.

## Prerequisites

- Node.js `>=22.13.0`
- A Cloudflare account
- A production D1 database

## Local development

```bash
npm install
npm run dev
npm run build
```

## Production deployment

Follow [the Cloudflare production deployment guide](docs/cloudflare-production.md).

Before the first deployment, create `n2n-production` in D1 and replace the
placeholder `database_id` in `wrangler.jsonc`.

## Production shape

- `app/` contains the web UI and API routes.
- `worker/index.ts` is the Cloudflare Worker entry point.
- `wrangler.jsonc` declares Assets, Images, D1, and scheduled cleanup.
- `drizzle/` contains the production D1 migrations.
- `db/schema.ts` is the typed database schema.
- WebRTC carries live messages and files directly between browsers.

## Useful commands

- `npm run dev`: start local development
- `npm run build`: build the vinext production bundle
- `npm run deploy:cloudflare`: deploy an already-built release to Workers
- `npm run db:migrate:production`: apply D1 migrations remotely
- `npm run cf:types`: generate Cloudflare binding types
- `npm test`: build and run the test suite
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Security documentation

- [Architecture](docs/architecture.md)
- [Threat model](docs/threat-model.md)
- [Development plan](docs/development-plan.md)
