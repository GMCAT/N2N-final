export const MAX_ENCRYPTED_BYTES = 1025 * 1024 * 1024;
export const MIN_EXPIRY_SECONDS = 60 * 60;
export const MAX_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
export const MAX_DOWNLOAD_LIMIT = 20;

export function validateTransferPolicy(input: {
  encryptedSize?: unknown;
  expiresInSeconds?: unknown;
  downloadLimit?: unknown;
}) {
  const encryptedSize = Number(input.encryptedSize);
  const expiresInSeconds = Number(input.expiresInSeconds ?? 24 * 60 * 60);
  const downloadLimit = Number(input.downloadLimit ?? 1);

  if (!Number.isSafeInteger(encryptedSize) || encryptedSize < 1 || encryptedSize > MAX_ENCRYPTED_BYTES) {
    throw new Error(`encryptedSize must be between 1 and ${MAX_ENCRYPTED_BYTES}`);
  }
  if (!Number.isSafeInteger(expiresInSeconds) || expiresInSeconds < MIN_EXPIRY_SECONDS || expiresInSeconds > MAX_EXPIRY_SECONDS) {
    throw new Error("expiresInSeconds must be between 1 hour and 7 days");
  }
  if (!Number.isSafeInteger(downloadLimit) || downloadLimit < 1 || downloadLimit > MAX_DOWNLOAD_LIMIT) {
    throw new Error(`downloadLimit must be between 1 and ${MAX_DOWNLOAD_LIMIT}`);
  }
  return { encryptedSize, expiresInSeconds, downloadLimit };
}

export function validateChunkManifest(input: {
  formatVersion?: unknown;
  fileId?: unknown;
  partCount?: unknown;
}) {
  const formatVersion = Number(input.formatVersion ?? 1);
  if (formatVersion === 1) return { formatVersion: 1 as const, fileId: null, partCount: 1 };
  const fileId = typeof input.fileId === "string" ? input.fileId : "";
  const partCount = Number(input.partCount);
  if (formatVersion !== 2) throw new Error("Unsupported transfer format");
  if (!/^[A-Za-z0-9_-]{16,128}$/u.test(fileId)) throw new Error("Invalid fileId");
  if (!Number.isSafeInteger(partCount) || partCount < 2 || partCount > 258) throw new Error("partCount must be between 2 and 258");
  return { formatVersion: 2 as const, fileId, partCount };
}
