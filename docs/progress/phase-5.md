# Phase 5 report — hardening and verification

Status: complete

## Security controls delivered

- Per-response nonce Content Security Policy with `strict-dynamic`; production
  policy excludes `unsafe-eval` and blocks objects, framing, foreign forms, and
  non-origin API connections.
- HSTS, no-referrer, MIME sniffing protection, frame denial, permissions policy,
  same-origin opener/resource isolation, and removal of framework/server headers.
- Same-origin and Fetch Metadata checks on every mutation endpoint.
- Atomic D1 rate limits for transfer creation, legacy upload, part upload,
  completion, download, and deletion.
- Rate-limit identities are SHA-256 digests scoped by operation and time window;
  raw IP addresses are not stored in D1.
- Automatic expiry of rate-limit rows and local-safe schema initialization while
  preserving checked-in production migrations.
- Next.js and React upgraded to patched releases after dependency review.

## Verification evidence

- Production build succeeds and discovers all UI/API routes.
- Twenty automated tests pass, including cryptography, chunk integrity, schema,
  atomic limits, CSP, browser headers, cross-origin rejection, and UI contracts.
- ESLint passes with no warnings or errors after the React hooks review.
- Production dependency audit reports zero known vulnerabilities.
- Browser verification confirms the sender page renders without console errors,
  security headers are present, a synthetic file encrypts and uploads through
  local D1/R2, a fragment-key link is created, and the synthetic transfer can be
  deleted successfully.

## Dependency note

The full development-only audit still reports advisories in the pinned Sites
toolchain (including the local development server and image tooling). They are
not included in the production dependency audit or deployed application path.
Until the Sites toolchain is upgraded compatibly, the development server must
remain bound to localhost and must not be exposed to untrusted networks.

## Remaining phase

Phase 6 will deploy the validated build, apply production storage resources and
migrations, configure cleanup scheduling/monitoring, and produce the final
operator and user handoff.

