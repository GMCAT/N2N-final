# Phase 2 report — local E2EE prototype

Status: complete

## Delivered

- Sender interface with click, keyboard, and drag-and-drop file selection.
- Receiver route that reads a key from the URL fragment and accepts `.n2n` packages.
- AES-256-GCM browser encryption with independent nonces for file data and metadata.
- Encrypted filename, media type, size, and modification timestamp.
- Authenticated domain separation for content and metadata.
- Base64url key and package encoding with strict format validation.
- Downloadable encrypted package and plaintext result using temporary object URLs.
- Responsive Thai interface with progress, disabled, success, and error states.
- Automated round-trip, wrong-key, tamper-detection, and fragment-link tests.

## Verification evidence

The focused Node test suite passed four of four tests. A standalone TypeScript
check of the cryptography and share-link modules also passed. Tests confirm that
plaintext content and the plaintext filename do not appear in the encrypted
package, and that altered ciphertext cannot be decrypted.

## Security decisions

- The key is included only after `#` in the receive URL.
- The prototype never stores keys in browser storage.
- Decryption produces a downloadable object only after AES-GCM authentication.
- Phase 2 is intentionally limited to 25 MB because it encrypts a file in one
  operation. Chunking and resumability belong to Phase 4.
- The `.n2n` file and key link are separate capabilities. Product copy recommends
  sending them over separate channels when practical.

## Known limitations and risks

- This phase transfers the encrypted package manually; server-backed ciphertext
  delivery is Phase 3.
- Full application build and visual runtime verification remain unavailable on
  this machine because the dependency registry blocks one transitive package.
  Cryptography tests do not depend on that package and pass independently.
- The JSON/base64 package format adds size overhead and is a prototype format.
  Phase 4 will replace it with an authenticated chunk container for large files.

## Next phase

Phase 3 adds opaque transfer records, D1 metadata, R2 ciphertext storage, and
create/complete/download/delete APIs while preserving the rule that the server
never receives the file key or plaintext metadata.

