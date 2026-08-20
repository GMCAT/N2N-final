import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pairing UI creates or joins an eight-digit live room", async () => {
  const [page, panel] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/PairingApp.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /PairingApp/u);
  assert.match(panel, /\/api\/rooms\/join/u);
  assert.match(panel, /\/heartbeat/u);
  assert.match(panel, /LIVE · PRIVATE · 1 TO 1/u);
  assert.match(panel, /ข้อความและไฟล์/u);
  assert.match(panel, /inputMode="numeric"/u);
  assert.match(panel, /useLiveRoom/u);
  assert.match(panel, /รหัสยืนยันต้องตรงกัน/u);
  assert.match(panel, /v1\.0\.1/u);
  assert.doesNotMatch(page + panel, /codex-preview|react-loading-skeleton/u);
});

test("legacy receiver still reads fragment keys and decrypts chunk containers", async () => {
  const [page, panel] = await Promise.all([
    readFile(new URL("../app/receive/[id]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/RemoteReceivePanel.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /CIPHERTEXT DELIVERY/u);
  assert.match(panel, /readKeyFromFragment\(window\.location\.hash\)/u);
  assert.match(panel, /decryptChunkContainer/u);
  assert.doesNotMatch(panel, /localStorage|sessionStorage/u);
});
