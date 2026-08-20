# N2N threat model

## Assets

- File plaintext and sensitive filename/metadata
- File encryption key
- Capability-style transfer and deletion links
- Availability and integrity of encrypted objects
- Transfer policy such as expiry and download count

## Adversaries considered

- A curious or compromised application server, database, or storage operator
- A network observer unable to defeat correctly configured TLS
- A person guessing or scanning transfer identifiers
- A recipient or link holder sharing the capability with another person
- An attacker modifying stored ciphertext or rearranging encrypted chunks
- An attacker attempting cross-site scripting, dependency compromise, or abuse

## Main controls

| Threat | Control |
| --- | --- |
| Server reads a file | Browser-only encryption; server receives ciphertext |
| Transfer IDs are guessed | At least 128 bits of cryptographic randomness and rate limiting |
| Ciphertext is modified | AES-GCM authentication; fail closed before saving plaintext |
| Chunks are reordered | Bind transfer ID, file version, and chunk index as authenticated data |
| Key leaks via requests | Put key in URL fragment and prohibit it from telemetry and logs |
| Key leaks through XSS | Restrictive CSP, no third-party scripts, escaped output, pinned dependencies |
| Expired data remains | Scheduled deletion with retry and orphan reconciliation |
| Download limit races | Atomic D1 update before granting storage access |
| Resource exhaustion | Size/count quotas, rate limits, bounded chunk buffers, upload expiry |

## Explicit limitations

- Anyone holding the complete share link can decrypt the file and can redistribute
  either the link or the resulting plaintext.
- E2EE does not protect a sender or recipient device that is already compromised.
- A malicious deployed frontend could steal new keys. Reproducible builds,
  deployment controls, CSP, and integrity monitoring reduce but do not eliminate
  this supply-chain risk.
- The service can observe operational metadata such as encrypted byte size,
  timestamps, IP addresses at the network edge, and request frequency.
- Antivirus scanning cannot inspect plaintext server-side. Product copy must not
  imply that downloaded content is safe.

## Review gates

Before release, verify that browser network traces contain no key or plaintext
metadata, tampered chunks always fail authentication, simultaneous downloads
respect limits, and cleanup removes both database records and object parts.

