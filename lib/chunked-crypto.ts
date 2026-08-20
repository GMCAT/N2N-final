import type { FileMetadata } from "./crypto";

export const CHUNK_SIZE = 4 * 1024 * 1024;
export const MAX_CHUNKED_FILE_BYTES = 1024 * 1024 * 1024;
const MAGIC = new TextEncoder().encode("N2N2");

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function decodeBase64Url(value: string): Uint8Array {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

function aad(fileId: string, kind: "metadata" | "content", index: number): Uint8Array {
  return new TextEncoder().encode(`n2n:v2:${fileId}:${kind}:${index}`);
}

async function encryptPart(key: CryptoKey, plaintext: ArrayBuffer, additionalData: Uint8Array) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: asBuffer(additionalData) },
    key,
    plaintext,
  );
  const part = new Uint8Array(12 + ciphertext.byteLength);
  part.set(iv);
  part.set(new Uint8Array(ciphertext), 12);
  return part;
}

async function decryptPart(key: CryptoKey, part: Uint8Array, additionalData: Uint8Array) {
  if (part.byteLength < 29) throw new Error("Encrypted part is malformed");
  return crypto.subtle.decrypt(
    { name: "AES-GCM", iv: asBuffer(part.subarray(0, 12)), additionalData: asBuffer(additionalData) },
    key,
    asBuffer(part.subarray(12)),
  );
}

export type ChunkPlan = {
  fileId: string;
  key: string;
  metadataPart: Uint8Array;
  contentChunkCount: number;
  partCount: number;
  encryptedSize: number;
  encryptContentChunk(index: number): Promise<Uint8Array>;
};

export async function createChunkPlan(file: File, chunkSize = CHUNK_SIZE): Promise<ChunkPlan> {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 64 * 1024 || chunkSize > CHUNK_SIZE) {
    throw new Error("Invalid chunk size");
  }
  if (file.size < 1 || file.size > MAX_CHUNKED_FILE_BYTES) {
    throw new Error("Files must be between 1 byte and 1 GB");
  }

  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const fileId = base64Url(crypto.getRandomValues(new Uint8Array(16)));
  const metadata: FileMetadata = {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
  };
  const metadataBytes = new TextEncoder().encode(JSON.stringify(metadata));
  const metadataPart = await encryptPart(key, asBuffer(metadataBytes), aad(fileId, "metadata", 0));
  const contentChunkCount = Math.ceil(file.size / chunkSize);
  const encryptedSize = metadataPart.byteLength + file.size + contentChunkCount * 28;
  const rawKey = await crypto.subtle.exportKey("raw", key);

  return {
    fileId,
    key: base64Url(new Uint8Array(rawKey)),
    metadataPart,
    contentChunkCount,
    partCount: contentChunkCount + 1,
    encryptedSize,
    async encryptContentChunk(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= contentChunkCount) throw new Error("Chunk index is out of range");
      const start = index * chunkSize;
      return encryptPart(key, await file.slice(start, Math.min(start + chunkSize, file.size)).arrayBuffer(), aad(fileId, "content", index));
    },
  };
}

export function encodeChunkContainer(fileId: string, parts: Uint8Array[]): Uint8Array {
  const fileIdBytes = new TextEncoder().encode(fileId);
  const size = 12 + fileIdBytes.byteLength + parts.reduce((sum, part) => sum + 4 + part.byteLength, 0);
  const output = new Uint8Array(size);
  const view = new DataView(output.buffer);
  output.set(MAGIC, 0);
  view.setUint32(4, fileIdBytes.byteLength);
  output.set(fileIdBytes, 8);
  view.setUint32(8 + fileIdBytes.byteLength, parts.length);
  let offset = 12 + fileIdBytes.byteLength;
  for (const part of parts) {
    view.setUint32(offset, part.byteLength);
    offset += 4;
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

export function parseChunkContainer(bytes: Uint8Array): { fileId: string; parts: Uint8Array[] } {
  if (bytes.byteLength < 12 || !MAGIC.every((byte, index) => bytes[index] === byte)) throw new Error("Invalid N2N chunk container");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const fileIdLength = view.getUint32(4);
  if (fileIdLength < 16 || fileIdLength > 128 || 12 + fileIdLength > bytes.byteLength) throw new Error("Invalid N2N chunk header");
  const fileId = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(8, 8 + fileIdLength));
  const partCount = view.getUint32(8 + fileIdLength);
  if (partCount < 2 || partCount > 1024) throw new Error("Invalid N2N part count");
  const parts: Uint8Array[] = [];
  let offset = 12 + fileIdLength;
  for (let index = 0; index < partCount; index += 1) {
    if (offset + 4 > bytes.byteLength) throw new Error("Truncated N2N container");
    const length = view.getUint32(offset);
    offset += 4;
    if (length < 29 || offset + length > bytes.byteLength) throw new Error("Invalid N2N part length");
    parts.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== bytes.byteLength) throw new Error("Unexpected data after N2N container");
  return { fileId, parts };
}

export async function decryptChunkContainer(bytes: Uint8Array, encodedKey: string) {
  const { fileId, parts } = parseChunkContainer(bytes);
  const rawKey = decodeBase64Url(encodedKey);
  if (rawKey.byteLength !== 32) throw new Error("Invalid N2N key length");
  const key = await crypto.subtle.importKey("raw", asBuffer(rawKey), "AES-GCM", false, ["decrypt"]);
  try {
    const metadataBytes = await decryptPart(key, parts[0], aad(fileId, "metadata", 0));
    const metadata = JSON.parse(new TextDecoder().decode(metadataBytes)) as FileMetadata;
    if (typeof metadata.name !== "string" || typeof metadata.size !== "number" || typeof metadata.type !== "string") throw new Error("Invalid metadata");
    const content: BlobPart[] = [];
    let decryptedSize = 0;
    for (let index = 1; index < parts.length; index += 1) {
      const chunk = await decryptPart(key, parts[index], aad(fileId, "content", index - 1));
      decryptedSize += chunk.byteLength;
      content.push(chunk);
    }
    if (decryptedSize !== metadata.size) throw new Error("File size mismatch");
    return { blob: new Blob(content, { type: metadata.type }), metadata };
  } catch {
    throw new Error("Decryption failed: the key is wrong or a chunk was changed");
  }
}
