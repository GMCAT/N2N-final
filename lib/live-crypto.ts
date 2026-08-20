const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export type LiveKeyPair = { keyPair: CryptoKeyPair; publicKey: string };

export async function createLiveKeyPair(): Promise<LiveKeyPair> {
  const keyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const raw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  return { keyPair, publicKey: bytesToBase64Url(new Uint8Array(raw)) };
}

const verificationWords = [
  "AMBER", "BAMBOO", "COBALT", "DELTA", "EMBER", "FOREST", "GOLD", "HARBOR",
  "INDIGO", "JASMINE", "KOALA", "LOTUS", "MANGO", "NOVA", "ORBIT", "PEARL",
];

export async function deriveLiveSession(
  privateKey: CryptoKey,
  peerPublicKey: string,
  roomId: string,
): Promise<{ encryptionKey: CryptoKey; verificationCode: string }> {
  const peerKey = await crypto.subtle.importKey(
    "raw",
    base64UrlToBytes(peerPublicKey),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const sharedBits = await crypto.subtle.deriveBits({ name: "ECDH", public: peerKey }, privateKey, 256);
  const material = await crypto.subtle.importKey("raw", sharedBits, "HKDF", false, ["deriveKey"]);
  const salt = await crypto.subtle.digest("SHA-256", encoder.encode(`n2n-room:${roomId}`));
  const encryptionKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: encoder.encode("n2n-live-data-v1") },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const fingerprint = new Uint8Array(await crypto.subtle.digest("SHA-256", sharedBits));
  const number = ((fingerprint[3] << 8) | fingerprint[4]) % 100;
  const verificationCode = `${verificationWords[fingerprint[0] & 15]}-${verificationWords[fingerprint[1] & 15]}-${number.toString().padStart(2, "0")}`;
  return { encryptionKey, verificationCode };
}

export async function encryptLivePacket(key: CryptoKey, roomId: string, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(`n2n:${roomId}:v1`) },
    key,
    plaintext,
  );
  return JSON.stringify({ v: 1, iv: bytesToBase64Url(iv), data: bytesToBase64Url(new Uint8Array(ciphertext)) });
}

export async function decryptLivePacket<T>(key: CryptoKey, roomId: string, envelope: string): Promise<T> {
  const parsed = JSON.parse(envelope) as { v?: unknown; iv?: unknown; data?: unknown };
  if (parsed.v !== 1 || typeof parsed.iv !== "string" || typeof parsed.data !== "string") throw new Error("Invalid encrypted packet");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(parsed.iv), additionalData: encoder.encode(`n2n:${roomId}:v1`) },
    key,
    base64UrlToBytes(parsed.data),
  );
  return JSON.parse(decoder.decode(plaintext)) as T;
}

export function encodeChunk(bytes: Uint8Array): string { return bytesToBase64Url(bytes); }
export function decodeChunk(value: string): Uint8Array<ArrayBuffer> { return base64UrlToBytes(value); }
