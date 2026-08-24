import assert from "node:assert/strict";
import test from "node:test";
import { createLiveKeyPair, decryptLivePacket, deriveLiveSession, encryptLivePacket } from "../lib/live-crypto.ts";

test("derives matching E2E keys and verification codes for a paired room", async () => {
  const sender = await createLiveKeyPair();
  const receiver = await createLiveKeyPair();
  const senderSession = await deriveLiveSession(sender.keyPair.privateKey, receiver.publicKey, "room-1");
  const receiverSession = await deriveLiveSession(receiver.keyPair.privateKey, sender.publicKey, "room-1");
  assert.equal(senderSession.verificationCode, receiverSession.verificationCode);
  assert.match(senderSession.verificationCode, /^[A-Z]+-[A-Z]+-\d{2}$/u);

  const encrypted = await encryptLivePacket(senderSession.encryptionKey, "room-1", { kind: "text", body: "secret" });
  assert.deepEqual(await decryptLivePacket(receiverSession.encryptionKey, "room-1", encrypted), { kind: "text", body: "secret" });
  await assert.rejects(() => decryptLivePacket(receiverSession.encryptionKey, "another-room", encrypted));
  const altered = JSON.parse(encrypted);
  altered.data = `${altered.data.startsWith("A") ? "B" : "A"}${altered.data.slice(1)}`;
  await assert.rejects(() => decryptLivePacket(receiverSession.encryptionKey, "room-1", JSON.stringify(altered)));
});
