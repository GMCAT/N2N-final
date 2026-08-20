import assert from "node:assert/strict";
import test from "node:test";
import { decryptPackage, encryptFile } from "../lib/crypto.ts";
import { createReceiveLink, readKeyFromFragment } from "../lib/share-link.ts";

function testFile(contents = "ข้อมูลลับ N2N") {
  return new File([contents], "สัญญา.txt", {
    type: "text/plain",
    lastModified: 1_725_000_000_000,
  });
}

test("encrypts and decrypts file bytes and metadata", async () => {
  const original = testFile();
  const encrypted = await encryptFile(original);
  const decrypted = await decryptPackage(encrypted.bytes, encrypted.key);

  assert.equal(new TextDecoder().decode(decrypted.bytes), "ข้อมูลลับ N2N");
  assert.deepEqual(decrypted.metadata, {
    name: original.name,
    type: original.type,
    size: original.size,
    lastModified: original.lastModified,
  });
  assert.doesNotMatch(new TextDecoder().decode(encrypted.bytes), /สัญญา|ข้อมูลลับ/u);
});

test("rejects a wrong key", async () => {
  const first = await encryptFile(testFile());
  const second = await encryptFile(testFile("different"));
  await assert.rejects(
    decryptPackage(first.bytes, second.key),
    /key is wrong or the package was changed/u,
  );
});

test("rejects modified ciphertext", async () => {
  const encrypted = await encryptFile(testFile());
  const container = JSON.parse(new TextDecoder().decode(encrypted.bytes));
  const index = Math.floor(container.content.length / 2);
  container.content = `${container.content.slice(0, index)}${container.content[index] === "A" ? "B" : "A"}${container.content.slice(index + 1)}`;
  const tampered = new TextEncoder().encode(JSON.stringify(container));

  await assert.rejects(
    decryptPackage(tampered, encrypted.key),
    /key is wrong or the package was changed/u,
  );
});

test("keeps the key in the URL fragment", () => {
  const link = createReceiveLink("opaque-transfer", "secret_key", "https://n2n.example");
  const url = new URL(link);
  assert.equal(url.pathname, "/receive/opaque-transfer");
  assert.equal(url.search, "");
  assert.equal(readKeyFromFragment(url.hash), "secret_key");
});
