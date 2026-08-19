import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("sender UI exposes encryption, progress, and cancellation states", async () => {
  const [page, panel] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/SendPanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /PRIVATE FILE TRANSFER/u);
  assert.match(page, /AES-256-GCM/u);
  assert.match(panel, /createChunkPlan/u);
  assert.match(panel, /อัปโหลด ciphertext/u);
  assert.match(panel, /abortRef\.current\?\.abort/u);
  assert.doesNotMatch(page + panel, /codex-preview|react-loading-skeleton/u);
});

test("receiver UI reads fragment keys and decrypts chunk containers", async () => {
  const [page, panel] = await Promise.all([
    readFile(new URL("../app/receive/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/RemoteReceivePanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /CIPHERTEXT DELIVERY/u);
  assert.match(panel, /readKeyFromFragment\(window\.location\.hash\)/u);
  assert.match(panel, /decryptChunkContainer/u);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/u);
});

