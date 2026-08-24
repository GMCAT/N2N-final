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
  assert.match(panel, /v1\.3\.4/u);
  assert.match(panel, /copyPairingCode/u);
  assert.match(panel, /กำลังรอรับกุญแจเข้ารหัสจากอีกฝ่าย/u);
  assert.match(panel, /live\.peerLeft/u);
  assert.match(panel, /createInFlightRef/u);
  assert.match(panel, /สร้างห้องบ่อยเกินไป/u);
  assert.match(panel, /keyExchangeStatus/u);
  assert.match(panel, /60_000/u);
  assert.match(panel, /\/close/u);
  assert.doesNotMatch(panel, /window\.confirm/u);
  assert.match(panel, /คุณอยู่ลำดับที่/u);
  assert.match(panel, /\/api\/rooms\/queue/u);
  assert.match(panel, /LARGE_FILE_WARNING_BYTES/u);
  assert.match(panel, /อาจใช้เวลาส่งนาน/u);
  assert.match(panel, /aria-keyshortcuts="Shift\+Enter"/u);
  assert.match(panel, /Mbps/u);
  assert.match(panel, /formatEta/u);
  assert.match(panel, /acceptIncomingFile/u);
  assert.doesNotMatch(page + panel, /codex-preview|react-loading-skeleton/u);
});

test("v1.1 streams large files with receiver consent and backpressure", async () => {
  const [live, rooms] = await Promise.all([
    readFile(new URL("../hooks/useLiveRoom.ts", import.meta.url), "utf8"),
    readFile(new URL("../server/rooms.ts", import.meta.url), "utf8"),
  ]);
  assert.match(live, /showSaveFilePicker/u);
  assert.doesNotMatch(live, /MAX_STREAM_SIZE/u);
  assert.match(live, /file-ready/u);
  assert.match(live, /file-ack/u);
  assert.match(live, /chainDigest/u);
  assert.match(live, /pauseTransfer/u);
  assert.match(live, /file-pause/u);
  assert.match(live, /file-resume/u);
  assert.match(live, /kind: "leave"/u);
  assert.match(live, /leaveRoom/u);
  assert.match(live, /handshakeRef/u);
  assert.match(live, /stun:stun\.cloudflare\.com:53/u);
  assert.match(live, /retrying/u);
  assert.match(live, /handshakePeer && handshakePeer\.roomId === roomId/u);
  assert.match(rooms, /expires_at = \?/u);
  assert.match(rooms, /MAX_ACTIVE_ROOMS = 1024/u);
  assert.match(rooms, /MAX_DAILY_ROOM_REQUESTS = 1000/u);
  assert.match(rooms, /MAX_QUEUE_SIZE = 25/u);
  assert.match(rooms, /room_queue/u);
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

test("production SEO exposes canonical metadata, robots, and sitemap", async () => {
  const [layout, robots, sitemap] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/robots.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
  ]);
  const productionUrl = "https://n2n-final.kumaikinpuck.workers.dev";

  assert.match(layout, /N2N Private Transfer/u);
  assert.match(layout, /metadataBase/u);
  assert.match(layout, /application\/ld\+json/u);
  assert.match(layout, /vtpdYncksEVv4dFiDiELThrbwUPICoPgxi03ak27fKA/u);
  assert.match(robots, /sitemap\.xml/u);
  assert.match(robots, /disallow: \["\/api\/", "\/receive\/"\]/u);
  assert.match(sitemap, new RegExp(productionUrl.replaceAll(".", "\\."), "u"));
});
