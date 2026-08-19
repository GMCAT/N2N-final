const VERSION = 1;
const CONTENT_AAD = new TextEncoder().encode("n2n:file:v1");
const METADATA_AAD = new TextEncoder().encode("n2n:metadata:v1");

export const PHASE_TWO_MAX_BYTES = 25 * 1024 * 1024;

export type FileMetadata = {
  name: string;
  type: string;
  size: number;
  lastModified: number;
};

type EncryptedPackage = {
  v: 1;
  algorithm: "AES-GCM";
  contentIv: string;
  metadataIv: string;
  content: string;
  metadata: string;
};

export type EncryptionResult = {
  bytes: Uint8Array;
  key: string;
  metadata: FileMetadata;
};

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  const stride = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += stride) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + stride));
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid base64url value");
  }
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "=",
  );
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.slice().buffer as ArrayBuffer;
}

async function importKey(encodedKey: string): Promise<CryptoKey> {
  const raw = base64UrlToBytes(encodedKey);
  if (raw.byteLength !== 32) throw new Error("Invalid N2N key length");
  return crypto.subtle.importKey("raw", asArrayBuffer(raw), "AES-GCM", false, ["decrypt"]);
}

function parsePackage(bytes: ArrayBuffer | Uint8Array): EncryptedPackage {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("This is not a valid N2N package");
  }

  if (
    typeof value !== "object" ||
    value === null ||
    !("v" in value) ||
    value.v !== VERSION ||
    !("algorithm" in value) ||
    value.algorithm !== "AES-GCM" ||
    !("contentIv" in value) ||
    typeof value.contentIv !== "string" ||
    !("metadataIv" in value) ||
    typeof value.metadataIv !== "string" ||
    !("content" in value) ||
    typeof value.content !== "string" ||
    !("metadata" in value) ||
    typeof value.metadata !== "string"
  ) {
    throw new Error("Unsupported or malformed N2N package");
  }

  return value as EncryptedPackage;
}

export async function encryptFile(file: File): Promise<EncryptionResult> {
  if (file.size > PHASE_TWO_MAX_BYTES) {
    throw new Error("Phase 2 supports files up to 25 MB");
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"],
  );
  const contentIv = crypto.getRandomValues(new Uint8Array(12));
  const metadataIv = crypto.getRandomValues(new Uint8Array(12));
  const metadata: FileMetadata = {
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    lastModified: file.lastModified,
  };

  const [content, encryptedMetadata, rawKey] = await Promise.all([
    crypto.subtle.encrypt(
      { name: "AES-GCM", iv: contentIv, additionalData: CONTENT_AAD },
      key,
      await file.arrayBuffer(),
    ),
    crypto.subtle.encrypt(
      { name: "AES-GCM", iv: metadataIv, additionalData: METADATA_AAD },
      key,
      new TextEncoder().encode(JSON.stringify(metadata)),
    ),
    crypto.subtle.exportKey("raw", key),
  ]);

  const container: EncryptedPackage = {
    v: VERSION,
    algorithm: "AES-GCM",
    contentIv: bytesToBase64Url(contentIv),
    metadataIv: bytesToBase64Url(metadataIv),
    content: bytesToBase64Url(new Uint8Array(content)),
    metadata: bytesToBase64Url(new Uint8Array(encryptedMetadata)),
  };

  return {
    bytes: new TextEncoder().encode(JSON.stringify(container)),
    key: bytesToBase64Url(new Uint8Array(rawKey)),
    metadata,
  };
}

export async function decryptPackage(
  bytes: ArrayBuffer | Uint8Array,
  encodedKey: string,
): Promise<{ bytes: Uint8Array; metadata: FileMetadata }> {
  const container = parsePackage(bytes);
  const key = await importKey(encodedKey);

  try {
    const [content, metadataBytes] = await Promise.all([
      crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: asArrayBuffer(base64UrlToBytes(container.contentIv)),
          additionalData: CONTENT_AAD,
        },
        key,
        asArrayBuffer(base64UrlToBytes(container.content)),
      ),
      crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: asArrayBuffer(base64UrlToBytes(container.metadataIv)),
          additionalData: METADATA_AAD,
        },
        key,
        asArrayBuffer(base64UrlToBytes(container.metadata)),
      ),
    ]);
    const metadata = JSON.parse(new TextDecoder().decode(metadataBytes));
    if (
      typeof metadata?.name !== "string" ||
      typeof metadata?.type !== "string" ||
      typeof metadata?.size !== "number" ||
      typeof metadata?.lastModified !== "number"
    ) {
      throw new Error("Invalid encrypted metadata");
    }
    const result = new Uint8Array(content);
    if (result.byteLength !== metadata.size) throw new Error("File size mismatch");
    return { bytes: result, metadata };
  } catch {
    throw new Error("Decryption failed: the key is wrong or the package was changed");
  }
}
