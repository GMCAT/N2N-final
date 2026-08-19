# Phase 3 report — durable ciphertext transfer

Status: complete

## Delivered

- D1 transfer schema and inspected SQL migration.
- R2 binding for encrypted objects; no plaintext metadata is persisted.
- Create, upload, complete, inspect, download, and delete API endpoints.
- 144-bit opaque transfer identifiers and independent 256-bit deletion tokens.
- One-way SHA-256 storage of deletion tokens.
- Pending-to-ready completion protocol that checks the stored object size.
- Atomic expiry and download-limit enforcement before ciphertext delivery.
- Scheduled cleanup for expired database records and objects.
- Sender UI that encrypts locally, uploads ciphertext, and creates a fragment-key link.
- Receiver route that downloads ciphertext and decrypts it locally.

## Verification evidence

Nine focused tests pass. They cover cryptographic round trips, wrong-key and
tamper rejection, fragment-only key links, transfer-policy bounds, successful
schema migration, unique object keys, and atomic refusal beyond the download
limit.

## Known limitation

Full runtime build and D1/R2 integration remain unavailable locally because the
network registry blocks a transitive dependency. The migration is validated
against an in-memory SQLite database and the storage contract is isolated behind
small helpers. Hosted integration verification remains a release gate.

