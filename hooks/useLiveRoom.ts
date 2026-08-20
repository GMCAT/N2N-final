"use client";

import { useEffect, useRef, useState } from "react";
import { createLiveKeyPair, decodeChunk, decryptLivePacket, deriveLiveSession, encodeChunk, encryptLivePacket, type LiveKeyPair } from "@/lib/live-crypto";

export type LiveSessionIdentity = { id: string; token: string; role: "sender" | "receiver" };
export type LiveMessage = {
  id: string;
  direction: "sent" | "received";
  kind: "text" | "file";
  text?: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  createdAt: number;
};

type Packet =
  | { kind: "confirm" }
  | { kind: "text"; id: string; body: string; createdAt: number }
  | { kind: "file-start"; id: string; name: string; mime: string; size: number; chunks: number; createdAt: number }
  | { kind: "file-chunk"; id: string; index: number; data: string }
  | { kind: "file-end"; id: string };

type IncomingFile = { name: string; mime: string; size: number; chunks: Array<Uint8Array | undefined>; createdAt: number };
type Signal = { id: number; kind: "offer" | "answer" | "ice" | "bye"; payload: unknown };

async function json<T>(response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? "Live channel request failed");
  return body;
}

export function useLiveRoom(session: LiveSessionIdentity | null, peerPublicKey: string | null) {
  const channelRef = useRef<RTCDataChannel | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const incomingFiles = useRef(new Map<string, IncomingFile>());
  const urlsRef = useRef<string[]>([]);
  const [encryptionKey, setEncryptionKey] = useState<CryptoKey | null>(null);
  const [cryptoRoomId, setCryptoRoomId] = useState("");
  const [localPair, setLocalPair] = useState<LiveKeyPair | null>(null);
  const [verificationCode, setVerificationCode] = useState("");
  const [channelOpen, setChannelOpen] = useState(false);
  const [localConfirmed, setLocalConfirmed] = useState(false);
  const [peerConfirmed, setPeerConfirmed] = useState(false);
  const [messages, setMessages] = useState<LiveMessage[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let active = true;
    void (async () => {
      try {
        const pair = await createLiveKeyPair();
        await json(await fetch(`/api/rooms/${session.id}/handshake`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
          body: JSON.stringify({ publicKey: pair.publicKey }),
        }));
        if (active) setLocalPair(pair);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "สร้างกุญแจเข้ารหัสไม่สำเร็จ");
      }
    })();
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!session || !localPair || !peerPublicKey) return;
    let active = true;
    void deriveLiveSession(localPair.keyPair.privateKey, peerPublicKey, session.id).then((derived) => {
      if (!active) return;
      keyRef.current = derived.encryptionKey;
      setEncryptionKey(derived.encryptionKey);
      setCryptoRoomId(session.id);
      setVerificationCode(derived.verificationCode);
    }).catch((caught) => {
      if (active) setError(caught instanceof Error ? caught.message : "สร้างกุญแจร่วมไม่สำเร็จ");
    });
    return () => { active = false; };
  }, [localPair, peerPublicKey, session]);

  useEffect(() => {
    if (!session || !encryptionKey || cryptoRoomId !== session.id || pcRef.current) return;
    let active = true;
    let cursor = 0;
    let pollTimer: ReturnType<typeof setTimeout>;
    const pendingIce: RTCIceCandidateInit[] = [];
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.cloudflare.com:3478" }] });
    pcRef.current = pc;

    async function publish(kind: Signal["kind"], payload: unknown) {
      await json(await fetch(`/api/rooms/${session.id}/signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.token}` },
        body: JSON.stringify({ kind, payload }),
      }));
    }

    async function receiveEnvelope(data: unknown) {
      if (typeof data !== "string" || !keyRef.current) return;
      const packet = await decryptLivePacket<Packet>(keyRef.current, session.id, data);
      if (packet.kind === "confirm") { setPeerConfirmed(true); return; }
      if (packet.kind === "text") {
        if (packet.body.length > 20_000) throw new Error("ข้อความยาวเกินกำหนด");
        setMessages((current) => [...current, { id: packet.id, direction: "received", kind: "text", text: packet.body, createdAt: packet.createdAt }]);
        return;
      }
      if (packet.kind === "file-start") {
        if (packet.size < 0 || packet.size > 100 * 1024 * 1024 || packet.chunks < 0 || packet.chunks > 2_134) throw new Error("ข้อมูลไฟล์ไม่ถูกต้อง");
        incomingFiles.current.set(packet.id, { name: packet.name, mime: packet.mime, size: packet.size, chunks: new Array(packet.chunks), createdAt: packet.createdAt });
        return;
      }
      if (packet.kind === "file-chunk") {
        const file = incomingFiles.current.get(packet.id);
        if (file && packet.index >= 0 && packet.index < file.chunks.length) file.chunks[packet.index] = decodeChunk(packet.data);
        return;
      }
      if (packet.kind === "file-end") {
        const file = incomingFiles.current.get(packet.id);
        if (!file || file.chunks.some((chunk) => !chunk)) throw new Error("ไฟล์ที่รับมาไม่ครบ");
        const url = URL.createObjectURL(new Blob(file.chunks as Uint8Array[], { type: file.mime }));
        urlsRef.current.push(url);
        setMessages((current) => [...current, { id: packet.id, direction: "received", kind: "file", fileName: file.name, fileUrl: url, fileSize: file.size, createdAt: file.createdAt }]);
        incomingFiles.current.delete(packet.id);
      }
    }

    function bindChannel(channel: RTCDataChannel) {
      channelRef.current = channel;
      channel.bufferedAmountLowThreshold = 256 * 1024;
      channel.onopen = () => setChannelOpen(true);
      channel.onclose = () => { setChannelOpen(false); setPeerConfirmed(false); };
      channel.onerror = () => setError("ช่องทางรับส่งขัดข้อง");
      channel.onmessage = (event) => { void receiveEnvelope(event.data).catch((caught) => setError(caught instanceof Error ? caught.message : "ถอดรหัสข้อมูลไม่สำเร็จ")); };
    }

    pc.onicecandidate = (event) => { if (event.candidate) void publish("ice", event.candidate.toJSON()).catch(() => setError("ส่งข้อมูลเชื่อมต่อไม่สำเร็จ")); };
    pc.onconnectionstatechange = () => {
      if (["failed", "closed", "disconnected"].includes(pc.connectionState)) setChannelOpen(false);
    };
    pc.ondatachannel = (event) => bindChannel(event.channel);

    async function applySignal(signal: Signal) {
      if (signal.kind === "offer" && session.role === "receiver") {
        await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        for (const candidate of pendingIce.splice(0)) await pc.addIceCandidate(candidate);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await publish("answer", pc.localDescription);
      } else if (signal.kind === "answer" && session.role === "sender") {
        await pc.setRemoteDescription(signal.payload as RTCSessionDescriptionInit);
        for (const candidate of pendingIce.splice(0)) await pc.addIceCandidate(candidate);
      } else if (signal.kind === "ice") {
        const candidate = signal.payload as RTCIceCandidateInit;
        if (pc.remoteDescription) await pc.addIceCandidate(candidate); else pendingIce.push(candidate);
      } else if (signal.kind === "bye") {
        pc.close();
      }
    }

    async function poll() {
      try {
        const result = await json<{ signals: Signal[]; cursor: number }>(await fetch(`/api/rooms/${session.id}/signals?after=${cursor}`, { headers: { Authorization: `Bearer ${session.token}` } }));
        for (const signal of result.signals) await applySignal(signal);
        cursor = result.cursor;
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "Signaling ขัดข้อง");
      } finally {
        if (active) pollTimer = setTimeout(poll, 850);
      }
    }

    void (async () => {
      if (session.role === "sender") {
        const channel = pc.createDataChannel("n2n-live", { ordered: true });
        bindChannel(channel);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await publish("offer", pc.localDescription);
      }
      await poll();
    })().catch((caught) => setError(caught instanceof Error ? caught.message : "เปิดช่องทางรับส่งไม่สำเร็จ"));

    return () => {
      active = false;
      clearTimeout(pollTimer);
      channelRef.current?.close();
      pc.close();
      pcRef.current = null;
      setChannelOpen(false);
    };
  }, [cryptoRoomId, encryptionKey, session]);

  useEffect(() => () => { for (const url of urlsRef.current) URL.revokeObjectURL(url); }, []);

  async function sendPacket(packet: Packet) {
    const channel = channelRef.current;
    const key = keyRef.current;
    if (!session || !key || !channel || channel.readyState !== "open") throw new Error("ช่องทางยังไม่พร้อม");
    while (channel.bufferedAmount > 1024 * 1024) await new Promise((resolve) => setTimeout(resolve, 25));
    channel.send(await encryptLivePacket(key, session.id, packet));
  }

  async function confirmPeer() {
    await sendPacket({ kind: "confirm" });
    setLocalConfirmed(true);
  }

  async function sendText(body: string) {
    if (!localConfirmed || !peerConfirmed) throw new Error("กรุณายืนยันรหัสทั้งสองฝ่ายก่อนส่ง");
    if (!body || body.length > 20_000) throw new Error("ข้อความต้องไม่เกิน 20,000 ตัวอักษร");
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    await sendPacket({ kind: "text", id, body, createdAt });
    setMessages((current) => [...current, { id, direction: "sent", kind: "text", text: body, createdAt }]);
  }

  async function sendFile(file: File) {
    if (!localConfirmed || !peerConfirmed) throw new Error("กรุณายืนยันรหัสทั้งสองฝ่ายก่อนส่ง");
    if (file.size > 100 * 1024 * 1024) throw new Error("ระยะทดลองรองรับไฟล์ไม่เกิน 100 MB");
    const id = crypto.randomUUID();
    const createdAt = Date.now();
    const chunkSize = 48 * 1024;
    const chunks = Math.ceil(file.size / chunkSize);
    setProgress(0);
    await sendPacket({ kind: "file-start", id, name: file.name, mime: file.type || "application/octet-stream", size: file.size, chunks, createdAt });
    for (let index = 0; index < chunks; index += 1) {
      const bytes = new Uint8Array(await file.slice(index * chunkSize, Math.min(file.size, (index + 1) * chunkSize)).arrayBuffer());
      await sendPacket({ kind: "file-chunk", id, index, data: encodeChunk(bytes) });
      setProgress((index + 1) / chunks);
    }
    await sendPacket({ kind: "file-end", id });
    const url = URL.createObjectURL(file);
    urlsRef.current.push(url);
    setMessages((current) => [...current, { id, direction: "sent", kind: "file", fileName: file.name, fileUrl: url, fileSize: file.size, createdAt }]);
    setProgress(0);
  }

  return {
    channelOpen,
    verificationCode,
    localConfirmed,
    peerConfirmed,
    ready: channelOpen && localConfirmed && peerConfirmed,
    messages,
    progress,
    error,
    confirmPeer,
    sendText,
    sendFile,
  };
}
