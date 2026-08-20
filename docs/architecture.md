# N2N architecture

## Trust boundary

The sender and recipient browsers are trusted endpoints. The API, database,
object storage, logs, analytics, CDN, and network are treated as unable to keep
plaintext confidential. Those systems may process or store ciphertext only.

## Transfer flow

1. The sender browser generates a random 256-bit file key.
2. Filename, media type, and other sensitive metadata are encoded into an
   encrypted metadata envelope.
3. File data is encrypted locally with AES-256-GCM. The production large-file
   format uses independently authenticated chunks and unique nonces.
4. The browser creates a transfer record and uploads ciphertext to object storage.
5. The service returns an opaque transfer identifier. The browser builds a URL
   whose path contains that identifier and whose fragment contains the file key.
6. The recipient browser reads the key from the fragment, requests ciphertext,
   authenticates and decrypts it locally, and saves the plaintext file.

Example link shape:

```text
https://example.test/receive/<opaque-transfer-id>#key=<base64url-key>
```

URL fragments are not part of HTTP requests. Application code must also prevent
the full URL from entering analytics, error reports, clipboard telemetry, or logs.

## Storage model

- R2 stores encrypted file chunks only.
- D1 stores opaque transfer ID, object prefix, encrypted metadata, byte count,
  status, expiry, download limit/count, and timestamps.
- A separate random deletion token is shown to the sender and stored only as a
  one-way digest.
- No encryption key, plaintext filename, or plaintext media type is persisted.

## Security invariants

- File keys are generated with a cryptographically secure browser API.
- A key or nonce is never reused for two AES-GCM encryption operations.
- Every encrypted chunk is bound to its transfer and chunk index as additional
  authenticated data, preventing reordering and cross-transfer substitution.
- A transfer is downloadable only after a verified completion transition.
- Download limits are updated atomically before issuing short-lived object access.
- Plaintext and keys never enter server requests, server-rendered markup, logs,
  database records, object metadata, or analytics events.
- The receive page runs under a restrictive Content Security Policy and does not
  load third-party scripts.

## Initial API surface

- `POST /api/transfers` creates a pending transfer.
- `PUT /api/transfers/:id/content` uploads the Phase 3 encrypted package.
- `POST /api/transfers/:id/complete` finalizes a complete transfer.
- `GET /api/transfers/:id` returns encrypted metadata and policy state.
- `POST /api/transfers/:id/download` consumes an allowed download and returns
  short-lived ciphertext access.
- `DELETE /api/transfers/:id` validates the deletion token and removes the transfer.
