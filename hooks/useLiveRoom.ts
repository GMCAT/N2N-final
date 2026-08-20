"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createLiveKeyPair, decodeChunk, decryptLivePacket, deriveLiveSession, encodeChunk, encryptLivePacket, type LiveKeyPair } from "@/lib/live-crypto";

export type LiveSessionIdentity = { id: string; token: string; role: "sender" | "receiver" };
export type LiveMessage = { id: string; direction: "sent" | "received"; kind: "text" | "file"; text?: string; fileName?: string; fileUrl?: string; fileSize?: number; createdAt: number };
export type IncomingOffer = { id: string; name: string; mime: string; size: number; chunks: number; createdAt: number; streamingSupported: boolean };
export type TransferStats = { fileName: string; totalBytes: number; transferredBytes: number; mbps: number; etaSeconds: number | null };

type Packet =
  | { kind: "confirm" }
  | { kind: "text"; id: string; body: string; createdAt: number }
  | { kind: "file-offer"; id: string; name: string; mime: string; size: number; chunks: number; createdAt: number }
  | { kind: "file-ready"; id: string; mode: "disk" | "memory" }
  | { kind: "file-reject"; id: string; reason: string }
  | { kind: "file-chunk"; id: string; index: number; data: string }
  | { kind: "file-ack"; id: string; index: number }
  | { kind: "file-pause"; id: string }
  | { kind: "file-resume"; id: string }
  | { kind: "file-cancel"; id: string }
  | { kind: "file-end"; id: string; digest: string };

type WritableLike = { write(data: Uint8Array): Promise<void>; close(): Promise<void>; abort?(reason?: unknown): Promise<void> };
type IncomingFile = { offer: IncomingOffer; mode: "disk" | "memory"; writable?: WritableLike; chunks?: Uint8Array[]; nextIndex: number; received: number; digest: Uint8Array };
type Signal = { id: number; kind: "offer" | "answer" | "ice" | "bye"; payload: unknown };

const MAX_MEMORY_SIZE = 100 * 1024 ** 2;
const CHUNK_SIZE = 48 * 1024;

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Live channel request failed");
  return body;
}

function savePicker(): ((options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<{ createWritable(): Promise<WritableLike> }>) | undefined {
  return (window as unknown as { showSaveFilePicker?: ReturnType<typeof savePicker> }).showSaveFilePicker;
}

async function chainDigest(previous: Uint8Array, bytes: Uint8Array): Promise<Uint8Array> {
  const combined = new Uint8Array(previous.byteLength + bytes.byteLength);
  combined.set(previous); combined.set(bytes, previous.byteLength);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", combined));
}

function digestText(value: Uint8Array): string { return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join(""); }

export function useLiveRoom(session: LiveSessionIdentity | null, peerPublicKey: string | null) {
  const channelRef = useRef<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const handshakeRef = useRef<{ roomId: string; promise: Promise<LiveKeyPair> } | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const incomingFiles = useRef(new Map<string, IncomingFile>());
  const outgoingReady = useRef(new Map<string, (mode: "disk" | "memory") => void>());
  const outgoingReject = useRef(new Map<string, (reason: Error) => void>());
  const ackWaiters = useRef(new Map<string, (index: number) => void>());
  const receiveQueue = useRef(Promise.resolve());
  const transferPausedRef = useRef(false);
  const peerPausedRef = useRef(false);
  const transferCancelledRef = useRef(false);
  const activeTransferRef = useRef<{ id: string; direction: "sending" | "receiving" } | null>(null);
  const metricRef = useRef({ lastAt: 0, lastBytes: 0, smoothedMbps: 0 });
  const urlsRef = useRef<string[]>([]);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [cryptoRoomId, setCryptoRoomId] = useState("");
  const [localPair, setLocalPair] = useState<LiveKeyPair | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [channelOpen, setChannelOpen] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState(false);
  const [peerConfirmed, setPeerConfirmed] = useState(false);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [incomingOffer, setIncomingOffer] = useState<IncomingOffer | null>(null);
  const [progress, setProgress] = useState(0);
  const [transferLabel, setTransferLabel] = useState("");
  const [transferPaused, setTransferPaused] = useState(false);
  const [transferStats, setTransferStats] = useState<TransferStats | null>(null);
  const [error, setError] = useState("");
  const roomId = session?.id;
  const roomToken = session?.token;

  function beginMetrics(fileName: string, totalBytes: number) {
    metricRef.current = { lastAt: performance.now(), lastBytes: 0, smoothedMbps: 0 };
    setTransferStats({ fileName, totalBytes, transferredBytes: 0, mbps: 0, etaSeconds: null });
  }

  function updateMetrics(fileName: string, totalBytes: number, transferredBytes: number) {
    const now = performance.now();
    const metric = metricRef.current;
    const elapsedMs = now - metric.lastAt;
    if (elapsedMs > 0 && transferredBytes >= metric.lastBytes) {
      const instantMbps = ((transferredBytes - metric.lastBytes) * 8) / (elapsedMs * 1000);
      metric.smoothedMbps = metric.smoothedMbps ? metric.smoothedMbps * 0.75 + instantMbps * 0.25 : instantMbps;
    }
    metric.lastAt = now; metric.lastBytes = transferredBytes;
    const remaining = Math.max(0, totalBytes - transferredBytes);
    const etaSeconds = metric.smoothedMbps > 0 ? (remaining * 8) / (metric.smoothedMbps * 1_000_000) : null;
    setTransferStats({ fileName, totalBytes, transferredBytes, mbps: metric.smoothedMbps, etaSeconds });
  }

  useEffect(() => {
    if (!roomId || !roomToken) return;
    let active = true;
    if (handshakeRef.current?.roomId !== roomId) {
      handshakeRef.current = { roomId, promise: (async () => {
        const pair = await createLiveKeyPair();
        await json(await fetch(`/api/rooms/${roomId}/handshake`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${roomToken}` }, body: JSON.stringify({ publicKey: pair.publicKey }) }));
        return pair;
      })() };
    }
    void handshakeRef.current.promise.then((pair) => { if (active) setLocalPair(pair); })
      .catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "สร้างกุญแจเข้ารหัสไม่สำเร็จ"); });
    return () => { active = false; };
  }, [roomId, roomToken]);

  useEffect(() => {
    if (!roomId || !localPair || !peerPublicKey) return;
    let active = true;
    void deriveLiveSession(localPair.keyPair.privateKey, peerPublicKey, roomId).then((derived) => {
      if (!active) return;
      keyRef.current = derived.encryptionKey; setEncryptionKey(derived.encryptionKey); setCryptoRoomId(roomId); setVerificationCode(derived.verificationCode);
    }).catch((caught) => { if (active) setError(caught instanceof Error ? caught.message : "สร้างกุญแจร่วมไม่สำเร็จ"); });
    return () => { active = false; };
  }, [localPair, peerPublicKey, roomId]);

  const sendPacket = useCallback(async (packet: Packet) => {
    const channel = channelRef.current; const key = keyRef.current;
    if (!session || !key || !channel || channel.readyState !== "open") throw new Error("ช่องทางยังไม่พร้อม");
    while (channel.bufferedAmount > 1024 * 1024) await new Promise((resolve) => setTimeout(resolve, 20));
    channel.send(await encryptLivePacket(key, session.id, packet));
  }, [session]);

  useEffect(() => {
    if (!session || !encryptionKey || cryptoRoomId !== session.id || pcRef.current) return;
    let active = true; let cursor = 0; let pollTimer: ReturnType<typeof setTimeout>;
    const pendingIce: RTCIceCandidateInit[] = [];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] }); pcRef.current = pc;
    async function publish(kind: Signal["kind"], payload: unknown) { await json(await fetch(`/api/rooms/${session.id}/signals`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` }, body: JSON.stringify({ kind, payload }) })); }

    async function receiveEnvelope(data: unknown) {
      if (typeof data !== "string" || !keyRef.current) return;
      const packet = await decryptLivePacket<Packet>(keyRef.current, session.id, data);
      if (packet.kind === "confirm") { setPeerConfirmed(true); return; }
      if (packet.kind === "text") { if (packet.body.length > 20_000) throw new Error("ข้อความยาวเกินกำหนด"); setMessages((v) => [...v, { id: packet.id, direction: "received", kind: "text", text: packet.body, createdAt: packet.createdAt }]); return; }
      if (packet.kind === "file-offer") {
        if (!Number.isSafeInteger(packet.size) || packet.size < 0 || !Number.isSafeInteger(packet.chunks) || packet.chunks !== Math.ceil(packet.size / CHUNK_SIZE)) throw new Error("ข้อมูลไฟล์ไม่ถูกต้อง");
        setIncomingOffer({ ...packet, streamingSupported: Boolean(savePicker()) }); return;
      }
      if (packet.kind === "file-ready") { outgoingReady.current.get(packet.id)?.(packet.mode); return; }
      if (packet.kind === "file-reject") { outgoingReject.current.get(packet.id)?.(new Error(packet.reason)); return; }
      if (packet.kind === "file-ack") { ackWaiters.current.get(packet.id)?.(packet.index); return; }
      if (packet.kind === "file-chunk") {
        const file = incomingFiles.current.get(packet.id);
        if (!file || packet.index !== file.nextIndex) throw new Error("ลำดับข้อมูลไฟล์ไม่ถูกต้อง");
        const bytes = decodeChunk(packet.data);
        if (file.received + bytes.byteLength > file.offer.size) throw new Error("ขนาดไฟล์ไม่ถูกต้อง");
        if (file.mode === "disk") await file.writable!.write(bytes); else file.chunks!.push(bytes);
        file.digest = await chainDigest(file.digest, bytes);
        file.received += bytes.byteLength; file.nextIndex += 1; setTransferLabel("กำลังรับไฟล์"); setProgress(file.offer.size ? file.received / file.offer.size : 1); updateMetrics(file.offer.name, file.offer.size, file.received);
        await sendPacket({ kind: "file-ack", id: packet.id, index: packet.index }); return;
      }
      if (packet.kind === "file-pause") { if (activeTransferRef.current?.id === packet.id) { peerPausedRef.current = true; setTransferPaused(true); setTransferLabel("อีกฝ่ายหยุดชั่วคราว"); setTransferStats((current) => current ? { ...current, mbps: 0, etaSeconds: null } : current); } return; }
      if (packet.kind === "file-resume") { if (activeTransferRef.current?.id === packet.id) { peerPausedRef.current = false; setTransferPaused(transferPausedRef.current); setTransferLabel(transferPausedRef.current ? "หยุดชั่วคราว" : activeTransferRef.current.direction === "sending" ? "กำลังส่งไฟล์" : "กำลังรับไฟล์"); } return; }
      if (packet.kind === "file-cancel") {
        const file = incomingFiles.current.get(packet.id);
        if (file) { await file.writable?.abort?.(); incomingFiles.current.delete(packet.id); }
        if (activeTransferRef.current?.id === packet.id) transferCancelledRef.current = true;
        activeTransferRef.current = null; peerPausedRef.current = false; transferPausedRef.current = false; setTransferPaused(false); setTransferLabel(""); setProgress(0); setTransferStats(null); setError("อีกฝ่ายยกเลิกการส่งไฟล์"); return;
      }
      if (packet.kind === "file-end") {
        const file = incomingFiles.current.get(packet.id);
        if (!file || file.received !== file.offer.size || file.nextIndex !== file.offer.chunks) throw new Error("ไฟล์ที่รับมาไม่ครบ");
        if (digestText(file.digest) !== packet.digest) { await file.writable?.abort?.(); incomingFiles.current.delete(packet.id); throw new Error("การตรวจสอบความสมบูรณ์ของไฟล์ไม่ผ่าน"); }
        let fileUrl: string | undefined;
        if (file.mode === "disk") await file.writable!.close();
        else { fileUrl = URL.createObjectURL(new Blob(file.chunks, { type: file.offer.mime })); urlsRef.current.push(fileUrl); }
        setMessages((v) => [...v, { id: packet.id, direction: "received", kind: "file", fileName: file.offer.name, fileUrl, fileSize: file.offer.size, createdAt: file.offer.createdAt }]);
        incomingFiles.current.delete(packet.id); activeTransferRef.current = null; setTransferLabel(""); setProgress(0); setTransferStats(null);
      }
    }

    function bindChannel(channel: RTCDataChannel) {
      channelRef.current = channel; channel.bufferedAmountLowThreshold = 256 * 1024;
      channel.onopen = () => setChannelOpen(true);
      channel.onclose = () => { setChannelOpen(false); setPeerConfirmed(false); };
      channel.onerror = () => setError("ช่องทางรับส่งขัดข้อง");
      channel.onmessage = (event) => { receiveQueue.current = receiveQueue.current.then(() => receiveEnvelope(event.data)).catch((caught) => setError(caught instanceof Error ? caught.message : "ถอดรหัสข้อมูลไม่สำเร็จ")); };
    }
    pc.onicecandidate = (event) => { if (event.candidate) void publish("ice", event.candidate.toJSON()).catch(() => setError("ส่งข้อมูลเชื่อมต่อไม่สำเร็จ")); };
    pc.onconnectionstatechange = () => { if (["failed", "closed", "disconnected"].includes(pc.connectionState)) setChannelOpen(false); };
    pc.ondatachannel = (event) => bindChannel(event.channel);
    async function applySignal(signal: Signal) {
      if (signal.kind === "offer" && session.role === "receiver") { await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit); for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c); const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await publish("answer", pc.localDescription); }
      else if (signal.kind === "answer" && session.role === "sender") { await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit); for (const c of pendingIce.splice(0)) await pc.addIceCandidate(c); }
      else if (signal.kind === "ice") { const c = signal.payload as RTCIceCandidateInit; if (pc.remoteDescription) await pc.addIceCandidate(c); else pendingIce.push(c); }
      else if (signal.kind === "bye") pc.close();
    }
    async function poll() { try { const result = await json<{ signals: Signal[]; cursor: number }>(await fetch(`/api/rooms/${session.id}/signals?after=${cursor}`, { headers: { Authorization: `Bearer ${session.token}` } })); for (const signal of result.signals) await applySignal(signal); cursor = result.cursor; } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : "Signaling ขัดข้อง"); } finally { if (active && pc.connectionState !== "connected") pollTimer = setTimeout(poll, 850); } }
    void (async () => { if (session.role === "sender") { const channel = pc.createDataChannel("n2n-live", { ordered: true }); bindChannel(channel); const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await publish("offer", pc.localDescription); } await poll(); })().catch((caught) => setError(caught instanceof Error ? caught.message : "เปิดช่องทางรับส่งไม่สำเร็จ"));
    return () => { active = false; clearTimeout(pollTimer); channelRef.current?.close(); pc.close(); pcRef.current = null; setChannelOpen(false); };
  }, [cryptoRoomId, encryptionKey, sendPacket, session]);

  useEffect(() => () => { for (const url of urlsRef.current) URL.revokeObjectURL(url); for (const file of incomingFiles.current.values()) void file.writable?.abort?.(); }, []);

  async function confirmPeer() { await sendPacket({ kind: "confirm" }); setLocalConfirmed(true); }
  async function sendText(body: string) { if (!localConfirmed || !peerConfirmed) throw new Error("กรุณายืนยันรหัสทั้งสองฝ่ายก่อนส่ง"); if (!body || body.length > 20_000) throw new Error("ข้อความต้องไม่เกิน 20,000 ตัวอักษร"); const id = crypto.randomUUID(); const createdAt = Date.now(); await sendPacket({ kind: "text", id, body, createdAt }); setMessages((v) => [...v, { id, direction: "sent", kind: "text", text: body, createdAt }]); }

  async function acceptIncomingFile() {
    const offer = incomingOffer; if (!offer) return;
    try {
      let file: IncomingFile;
      const picker = savePicker();
      if (picker) {
        const handle = await picker({ suggestedName: offer.name, types: [{ description: offer.mime || "File", accept: { [offer.mime || "application/octet-stream"]: [`.${offer.name.split(".").pop() || "bin"}`] } }] });
        file = { offer, mode: "disk", writable: await handle.createWritable(), nextIndex: 0, received: 0, digest: new Uint8Array() };
      } else {
        if (offer.size > MAX_MEMORY_SIZE) throw new Error("เบราว์เซอร์นี้รับไฟล์แบบสตรีมไม่ได้ และโหมดสำรองจำกัด 100 MB");
        file = { offer, mode: "memory", chunks: [], nextIndex: 0, received: 0, digest: new Uint8Array() };
      }
      incomingFiles.current.set(offer.id, file); activeTransferRef.current = { id: offer.id, direction: "receiving" }; transferCancelledRef.current = false; transferPausedRef.current = false; peerPausedRef.current = false; setTransferPaused(false); setIncomingOffer(null); setTransferLabel("รอรับไฟล์"); setProgress(0); beginMetrics(offer.name, offer.size);
      await sendPacket({ kind: "file-ready", id: offer.id, mode: file.mode });
    } catch (caught) { if ((caught as { name?: string }).name !== "AbortError") setError(caught instanceof Error ? caught.message : "เตรียมรับไฟล์ไม่สำเร็จ"); }
  }
  async function rejectIncomingFile() { const offer = incomingOffer; if (!offer) return; setIncomingOffer(null); await sendPacket({ kind: "file-reject", id: offer.id, reason: "ผู้รับปฏิเสธไฟล์" }); }

  async function sendFile(file: File) {
    if (!localConfirmed || !peerConfirmed) throw new Error("กรุณายืนยันรหัสทั้งสองฝ่ายก่อนส่ง");
    const id = crypto.randomUUID(); const createdAt = Date.now(); const chunks = Math.ceil(file.size / CHUNK_SIZE);
    activeTransferRef.current = { id, direction: "sending" }; transferCancelledRef.current = false; transferPausedRef.current = false; peerPausedRef.current = false; setTransferPaused(false); setTransferLabel("รอผู้รับเลือกตำแหน่งบันทึก"); setProgress(0); beginMetrics(file.name, file.size);
    const ready = new Promise<"disk" | "memory">((resolve, reject) => { outgoingReady.current.set(id, resolve); outgoingReject.current.set(id, reject); });
    await sendPacket({ kind: "file-offer", id, name: file.name, mime: file.type || "application/octet-stream", size: file.size, chunks, createdAt });
    await ready; outgoingReady.current.delete(id); outgoingReject.current.delete(id); beginMetrics(file.name, file.size); setTransferLabel("กำลังส่งไฟล์");
    let digest = new Uint8Array();
    for (let index = 0; index < chunks; index += 1) {
      while (transferPausedRef.current || peerPausedRef.current) await new Promise((resolve) => setTimeout(resolve, 100));
      if (transferCancelledRef.current) throw new Error("ยกเลิกการส่งไฟล์แล้ว");
      const ack = new Promise<number>((resolve) => ackWaiters.current.set(id, resolve));
      const bytes = new Uint8Array(await file.slice(index * CHUNK_SIZE, Math.min(file.size, (index + 1) * CHUNK_SIZE)).arrayBuffer());
      digest = await chainDigest(digest, bytes);
      await sendPacket({ kind: "file-chunk", id, index, data: encodeChunk(bytes) });
      const acknowledged = await ack; if (acknowledged !== index) throw new Error("การยืนยัน chunk ไม่ตรงกัน");
      const transferred = Math.min(file.size, (index + 1) * CHUNK_SIZE); setProgress((index + 1) / Math.max(chunks, 1)); updateMetrics(file.name, file.size, transferred);
    }
    ackWaiters.current.delete(id); await sendPacket({ kind: "file-end", id, digest: digestText(digest) });
    const url = URL.createObjectURL(file); urlsRef.current.push(url); setMessages((v) => [...v, { id, direction: "sent", kind: "file", fileName: file.name, fileUrl: url, fileSize: file.size, createdAt }]); activeTransferRef.current = null; setTransferLabel(""); setProgress(0); setTransferStats(null);
  }

  function pauseTransfer() { const active = activeTransferRef.current; if (!active) return; transferPausedRef.current = true; setTransferPaused(true); setTransferLabel("หยุดชั่วคราว"); setTransferStats((current) => current ? { ...current, mbps: 0, etaSeconds: null } : current); void sendPacket({ kind: "file-pause", id: active.id }).catch((caught) => setError(caught instanceof Error ? caught.message : "หยุดชั่วคราวไม่สำเร็จ")); }
  function resumeTransfer() { const active = activeTransferRef.current; if (!active) return; transferPausedRef.current = false; setTransferPaused(peerPausedRef.current); setTransferLabel(peerPausedRef.current ? "รออีกฝ่ายส่งต่อ" : active.direction === "sending" ? "กำลังส่งไฟล์" : "กำลังรับไฟล์"); metricRef.current.lastAt = performance.now(); metricRef.current.lastBytes = transferStats?.transferredBytes ?? 0; void sendPacket({ kind: "file-resume", id: active.id }).catch((caught) => setError(caught instanceof Error ? caught.message : "ส่งต่อไม่สำเร็จ")); }
  function cancelTransfer() { const active = activeTransferRef.current; if (!active) return; transferCancelledRef.current = true; transferPausedRef.current = false; peerPausedRef.current = false; const incoming = incomingFiles.current.get(active.id); void incoming?.writable?.abort?.(); incomingFiles.current.delete(active.id); activeTransferRef.current = null; setTransferPaused(false); setTransferLabel(""); setProgress(0); setTransferStats(null); void sendPacket({ kind: "file-cancel", id: active.id }).catch((caught) => setError(caught instanceof Error ? caught.message : "ยกเลิกไม่สำเร็จ")); }

  return { channelOpen, verificationCode, localConfirmed, peerConfirmed, ready: channelOpen && localConfirmed && peerConfirmed, messages, incomingOffer, progress, transferLabel, transferStats, transferPaused, error, confirmPeer, sendText, sendFile, acceptIncomingFile, rejectIncomingFile, pauseTransfer, resumeTransfer, cancelTransfer };
}
