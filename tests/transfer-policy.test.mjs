import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_ENCRYPTED_BYTES,
  MAX_EXPIRY_SECONDS,
  validateChunkManifest,
  validateTransferPolicy,
} from "../lib/transfer-policy.ts";

test("accepts and normalizes a valid transfer policy", () => {
  assert.deepEqual(validateTransferPolicy({
    encryptedSize: "1024",
    expiresInSeconds: 86400,
    downloadLimit: 3,
  }), { encryptedSize: 1024, expiresInSeconds: 86400, downloadLimit: 3 });
});

test("validates authenticated chunk manifests", () => {
  assert.deepEqual(validateChunkManifest({
    formatVersion: 2,
    fileId: "abcdefghijklmnop",
    partCount: 4,
  }), { formatVersion: 2, fileId: "abcdefghijklmnop", partCount: 4 });
  assert.throws(() => validateChunkManifest({ formatVersion: 2, fileId: "short", partCount: 4 }), /fileId/u);
  assert.throws(() => validateChunkManifest({ formatVersion: 2, fileId: "abcdefghijklmnop", partCount: 999 }), /partCount/u);
});

test("applies safe policy defaults", () => {
  assert.deepEqual(validateTransferPolicy({ encryptedSize: 42 }), {
    encryptedSize: 42,
    expiresInSeconds: 86400,
    downloadLimit: 1,
  });
});

test("rejects oversized, long-lived, and excessive-download transfers", () => {
  assert.throws(() => validateTransferPolicy({ encryptedSize: MAX_ENCRYPTED_BYTES + 1 }), /encryptedSize/u);
  assert.throws(() => validateTransferPolicy({ encryptedSize: 1, expiresInSeconds: MAX_EXPIRY_SECONDS + 1 }), /expiresInSeconds/u);
  assert.throws(() => validateTransferPolicy({ encryptedSize: 1, downloadLimit: 21 }), /downloadLimit/u);
});
