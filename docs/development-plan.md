# N2N development plan

## Product goal

N2N is a browser-based file transfer service. Files are encrypted on the
sender's device and decrypted on the recipient's device. The service stores
only ciphertext and the minimum metadata needed to operate a transfer.

## MVP acceptance criteria

- A sender can select a file, encrypt it locally, upload it, and copy a share link.
- A recipient with the complete share link can download and decrypt the file locally.
- The decryption key is stored only in the URL fragment and is never sent to the server.
- Transfers can expire and can have a download limit.
- Expired objects and metadata are removed automatically.
- Upload and download views expose progress, cancellation, and useful error states.
- The core flow works without an account on current desktop and mobile browsers.

## Delivery phases

### Phase 1 — Foundation and security design

Deliverables: project scaffold, MVP scope, system architecture, threat model,
data lifecycle, and documented security invariants.

Exit check: the browser/server trust boundary and the key-handling rules are
explicit enough to guide implementation and review.

### Phase 2 — Local encryption prototype and interface

Deliverables: upload and receive screens, Web Crypto AES-256-GCM module,
encrypted metadata envelope, share-link encoder/decoder, progress UI, and unit
tests for encryption round trips and tamper detection.

Exit check: a file can be encrypted, transferred in memory, and decrypted on a
second page without exposing the key to application APIs.

### Phase 3 — Durable transfer service

Deliverables: R2 ciphertext storage, D1 transfer metadata, upload/download API,
opaque transfer identifiers, completion protocol, deletion token, and cleanup job.

Exit check: an encrypted file survives page refresh and can be retrieved by its
transfer link while plaintext remains unavailable to the server.

### Phase 4 — Large files and transfer policy

Deliverables: chunked encryption, multipart/resumable transfer, cancellation,
expiration, atomic download limits, retry behavior, and concurrency handling.

Exit check: interrupted large transfers recover safely and transfer policies
cannot be bypassed by ordinary concurrent requests.

### Phase 5 — Hardening and verification

Deliverables: strict CSP and security headers, dependency review, abuse limits,
automated unit/integration tests, cross-browser checks, accessibility review,
and a production build.

Exit check: the complete sender-to-recipient flow passes automated and manual
security-focused acceptance tests.

### Phase 6 — Release

Deliverables: production deployment, cleanup schedule, monitoring with no secret
URLs or keys in logs, operating guide, recovery notes, and final release report.

Exit check: the deployed service is usable, observable, and documented without
weakening its end-to-end encryption guarantees.

## Progress reporting

At the end of every phase, report completed deliverables, verification evidence,
open risks, decisions made, and the scope of the next phase. A phase is not marked
complete solely because code was written; its exit check must pass.

