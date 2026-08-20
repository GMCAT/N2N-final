import assert from "node:assert/strict";
import test from "node:test";
import { createChunkPlan, decryptChunkContainer, encodeChunkContainer } from "../lib/chunked-crypto.ts";

async function encryptedFixture() {
  const source = Uint8Array.from({ length: 150_000 }, (_, index) => index % 251);
  const file = new File([source], "large.bin", { type: "application/octet-stream", lastModified: 42 });
  const plan = await createChunkPlan(file, 64 * 1024);
  const parts = [plan.metadataPart];
  for (let index = 0; index < plan.contentChunkCount; index += 1) parts.push(await plan.encryptContentChunk(index));
  return { file, source, plan, parts, container: encodeChunkContainer(plan.fileId, parts) };
}

test("round-trips authenticated chunk containers", async () => {
  const fixture = await encryptedFixture();
  const decrypted = await decryptChunkContainer(fixture.container, fixture.plan.key);
  assert.deepEqual(new Uint8Array(await decrypted.blob.arrayBuffer()), fixture.source);
  assert.equal(decrypted.metadata.name, "large.bin");
});

test("rejects reordered or altered chunks", async () => {
  const fixture = await encryptedFixture();
  const reorderedParts = [fixture.parts[0], fixture.parts[2], fixture.parts[1], ...fixture.parts.slice(3)];
  await assert.rejects(
    decryptChunkContainer(encodeChunkContainer(fixture.plan.fileId, reorderedParts), fixture.plan.key),
    /chunk was changed/u,
  );
  const altered = fixture.container.slice();
  altered[altered.length - 1] ^= 1;
  await assert.rejects(decryptChunkContainer(altered, fixture.plan.key), /chunk was changed/u);
});

test("calculates exact encrypted payload size", async () => {
  const fixture = await encryptedFixture();
  assert.equal(fixture.plan.encryptedSize, fixture.parts.reduce((sum, part) => sum + part.byteLength, 0));
});
