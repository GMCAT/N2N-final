"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { useLiveRoom } from "@/hooks/useLiveRoom";

type Mode = "choose" | "receive";
type Role = "sender" | "receiver";
type Session = { id: string; token: string; role: Role; code: string; expiresAt: number };
type RoomStatus = "waiting" | "connected" | "closed";

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "ไม่สามารถเชื่อมต่อได้");
  return payload;
}

function formatCode(value: string): string {
  const digits = value.replace(/\D/gu, "").slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function formatEta(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "กำลังคำนวณ…";
  const rounded = Math.max(0, Math.ceil(seconds));
  if (rounded < 60) return `${rounded} วินาที`;
  if (rounded < 3600) return `${Math.floor(rounded / 60)} นาที ${rounded % 60} วินาที`;
  return `${Math.floor(rounded / 3600)} ชม. ${Math.ceil((rounded % 3600) / 60)} นาที`;
}

export function PairingApp() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("choose");
  const [session, setSession] = useState<Session | null>(null);
  const [roomExpiresAt, setRoomExpiresAt] = useState(0);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("waiting");
  const [peerOnline, setPeerOnline] = useState(false);
  const [peerPublicKey, setPeerPublicKey] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const live = useLiveRoom(session, peerPublicKey);

  useEffect(() => {
    if (!session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function heartbeat() {
      try {
        const status = await responseJson<{ status: RoomStatus; peerOnline: boolean; peerPublicKey: string | null; expiresAt: number }>(
          await fetch(`/api/rooms/${session?.id}/heartbeat`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session?.token}` },
          }),
        );
        if (active) {
          setRoomStatus(status.status);
          setPeerOnline(status.peerOnline);
          setPeerPublicKey(status.peerPublicKey);
          setRoomExpiresAt(status.expiresAt);
          setError("");
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : "ขาดการเชื่อมต่อกับห้อง");
      } finally {
        if (active) timer = setTimeout(heartbeat, 3_000);
      }
    }
    void heartbeat();
    return () => { active = false; clearTimeout(timer); };
  }, [session]);

  async function createRoom() {
    setBusy(true);
    setError("");
    try {
      const room = await responseJson<{ id: string; code: string; senderToken: string; expiresAt: number }>(
        await fetch("/api/rooms", { method: "POST" }),
      );
      setSession({ id: room.id, token: room.senderToken, role: "sender", code: room.code, expiresAt: room.expiresAt });
      setRoomExpiresAt(room.expiresAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "สร้างห้องไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  async function joinRoom(event: FormEvent) {
    event.preventDefault();
    const code = codeInput.replace(/\D/gu, "");
    if (code.length !== 8) return;
    setBusy(true);
    setError("");
    try {
      const room = await responseJson<{ id: string; receiverToken: string; expiresAt: number }>(
        await fetch("/api/rooms/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        }),
      );
      setSession({ id: room.id, token: room.receiverToken, role: "receiver", code, expiresAt: room.expiresAt });
      setRoomExpiresAt(room.expiresAt);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เข้าร่วมห้องไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  function reset() {
    setSession(null); setMode("choose"); setRoomStatus("waiting"); setPeerOnline(false);
    setCodeInput(""); setDraft(""); setFile(null); setError(""); setPeerPublicKey(null); setRoomExpiresAt(0);
  }

  async function sendCurrent() {
    try {
      setError("");
      if (draft.trim()) await live.sendText(draft.trim());
      if (file) await live.sendFile(file);
      setDraft("");
      setFile(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ส่งข้อมูลไม่สำเร็จ");
    }
  }

  const connected = roomStatus === "connected" && peerOnline;
  const code = session?.code ?? "";

  return (
    <main className="pair-shell">
      <nav className="topbar pair-topbar" aria-label="เมนูหลัก">
        <button className="brand brand-button" onClick={reset} aria-label="กลับหน้าแรก">N2N<span>.</span><small className="version-mark">v1.1.4</small></button>
        <div className={`live-pill ${connected ? "is-online" : ""}`}><span aria-hidden="true" />{connected ? "เชื่อมต่อแล้ว" : session ? "กำลังรออีกฝ่าย" : "พร้อมจับคู่"}</div>
      </nav>

      {!session ? (
        <section className="pair-landing">
          <div className="pair-intro">
            <p className="kicker"><span /> LIVE · PRIVATE · 1 TO 1</p>
            <h1>ส่งถึงกัน<br /><em>ตรงนี้ ทันที</em></h1>
            <p>สร้างรหัส 8 หลักให้อีกฝ่ายกรอก เมื่อสถานะขึ้นออนไลน์ คุณส่งข้อความหรือไฟล์ถึงกันได้ในห้องเดียว</p>
            <div className="trust-row"><span>◆ ไม่ต้องสมัคร</span><span>◆ ห้องชั่วคราว</span><span>◆ เข้ารหัส E2E</span></div>
          </div>
          <div className="pair-card">
            {mode === "choose" ? (
              <>
                <p className="eyebrow">START A PRIVATE ROOM</p><h2>คุณต้องการทำอะไร?</h2>
                <div className="choice-grid">
                  <button className="choice-button choice-send" disabled={busy} onClick={createRoom}><span className="choice-number">01</span><strong>ส่ง</strong><small>สร้างรหัสให้ผู้รับ</small></button>
                  <button className="choice-button" onClick={() => { setMode("receive"); setError(""); }}><span className="choice-number">02</span><strong>รับ</strong><small>กรอกรหัสจากผู้ส่ง</small></button>
                </div>
              </>
            ) : (
              <form onSubmit={joinRoom}>
                <button type="button" className="back-button" onClick={() => setMode("choose")}>← กลับ</button>
                <p className="eyebrow">JOIN A PRIVATE ROOM</p><h2>กรอกรหัสจากผู้ส่ง</h2>
                <label className="code-label" htmlFor="room-code">รหัส 2 ชุด ชุดละ 4 ตัว</label>
                <input id="room-code" className="code-input" value={codeInput} onChange={(event) => setCodeInput(formatCode(event.target.value))} placeholder="0000 0000" inputMode="numeric" autoComplete="one-time-code" autoFocus />
                <button className="primary-button" disabled={codeInput.replace(/\D/gu, "").length !== 8 || busy}>{busy ? "กำลังตรวจสอบ…" : "เข้าร่วมห้อง"}</button>
              </form>
            )}
            {error && <p className="error-message" role="alert">{error}</p>}
          </div>
        </section>
      ) : (
        <section className="room-layout">
          <aside className="room-sidebar">
            <p className="eyebrow">{session.role === "sender" ? "YOUR PAIRING CODE" : "CONNECTED WITH CODE"}</p>
            <h1>{session.role === "sender" ? "ส่งรหัสนี้ให้ผู้รับ" : "เข้าห้องแล้ว"}</h1>
            <div className="code-display" aria-label={`รหัสห้อง ${formatCode(session.code)}`}><span>{code.slice(0, 4)}</span><span>{code.slice(4, 8)}</span></div>
            <div className={`peer-status ${connected ? "is-online" : ""}`}><span aria-hidden="true" /><div><strong>{connected ? "อีกฝ่ายออนไลน์" : "กำลังรออีกฝ่าย"}</strong><small>{connected ? "พร้อมสร้างช่องทางเข้ารหัส" : "เปิดหน้านี้ค้างไว้"}</small></div></div>
            <p className="expiry-note">ห้องหมดอายุ {new Date(roomExpiresAt || session.expiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</p>
            <button className="secondary-button leave-button" onClick={reset}>ออกจากห้อง</button>
          </aside>
          <section className="conversation" aria-label="พื้นที่รับส่งข้อมูล">
            <header className="conversation-header"><div><p className="eyebrow">PRIVATE CHANNEL</p><h2>ข้อความและไฟล์</h2></div><span className={`security-chip ${live.ready ? "is-secure" : ""}`}>{live.ready ? "E2E · VERIFIED" : live.channelOpen ? "E2E · VERIFY" : "E2E · CONNECTING"}</span></header>
            {live.channelOpen && !live.ready && (
              <div className="verify-panel">
                <div><small>รหัสยืนยันต้องตรงกันทั้งสองหน้าจอ</small><strong>{live.verificationCode || "กำลังสร้าง…"}</strong></div>
                <button className="verify-button" disabled={!live.verificationCode || live.localConfirmed} onClick={() => void live.confirmPeer().catch((caught) => setError(caught instanceof Error ? caught.message : "ยืนยันไม่สำเร็จ"))}>{live.localConfirmed ? "ยืนยันแล้ว" : "รหัสตรงกัน"}</button>
                {live.localConfirmed && !live.peerConfirmed && <small className="wait-confirm">รออีกฝ่ายยืนยัน</small>}
              </div>
            )}
            <div className="message-stage" aria-live="polite">
              {live.messages.length === 0 ? <div className="empty-conversation"><span className="channel-mark" aria-hidden="true">↔</span><strong>{live.ready ? "ช่องทางปลอดภัยพร้อมแล้ว" : connected ? "จับคู่สำเร็จ" : "ยังไม่มีใครอยู่อีกฝั่ง"}</strong><p>{live.ready ? "พิมพ์ข้อความหรือเลือกไฟล์เพื่อส่งได้ทันที" : connected ? "กำลังสร้างช่องทางเข้ารหัสระหว่างเบราว์เซอร์" : "เมื่ออีกฝ่ายเข้าด้วยรหัสนี้ สถานะจะเปลี่ยนเป็นออนไลน์"}</p></div> : (
                <div className="message-list">{live.messages.map((message) => <article key={message.id} className={`message-item ${message.direction}`}>
                  {message.kind === "text" ? <p>{message.text}</p> : <a href={message.fileUrl} download={message.fileName}><span>FILE</span><div><strong>{message.fileName}</strong><small>{formatBytes(message.fileSize ?? 0)} · ดาวน์โหลด</small></div></a>}
                  <time>{new Date(message.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</time>
                </article>)}</div>
              )}
            </div>
            {live.incomingOffer && <div className="file-offer"><div><span>ไฟล์กำลังรอรับ</span><strong>{live.incomingOffer.name}</strong><small>{formatBytes(live.incomingOffer.size)} · {live.incomingOffer.streamingSupported ? "บันทึกลงดิสก์โดยตรง" : "โหมดสำรองไม่เกิน 100 MB"}</small></div><button className="verify-button" onClick={() => void live.acceptIncomingFile()}>เลือกที่บันทึกและรับ</button><button className="secondary-button" onClick={() => void live.rejectIncomingFile()}>ปฏิเสธ</button></div>}
            {live.transferLabel && <div className="live-progress"><span>{live.transferLabel}</span><strong>{Math.round(live.progress * 100)}%</strong><progress max="1" value={live.progress} />{live.transferStats && <div className="transfer-stats"><span><small>ไฟล์</small><b>{live.transferStats.fileName}</b></span><span><small>ส่งแล้ว / ทั้งหมด</small><b>{formatBytes(live.transferStats.transferredBytes)} / {formatBytes(live.transferStats.totalBytes)}</b></span><span><small>ความเร็ว</small><b>{live.transferStats.mbps > 0 ? `${live.transferStats.mbps.toFixed(2)} Mbps` : "— Mbps"}</b></span><span><small>คาดว่าจะเสร็จ</small><b>{formatEta(live.transferStats.etaSeconds)}</b></span></div>}{live.progress > 0 && <div className="transfer-actions"><button onClick={live.transferPaused ? live.resumeTransfer : live.pauseTransfer}>{live.transferPaused ? "ส่งต่อ" : "หยุดชั่วคราว"}</button><button onClick={live.cancelTransfer}>ยกเลิก</button></div>}</div>}
            {file && <div className="file-preview"><span>FILE</span><div><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div><button onClick={() => setFile(null)} aria-label="เอาไฟล์ออก">×</button></div>}
            <div className="composer">
              <input ref={fileRef} className="visually-hidden" type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} />
              <button className="attach-button" onClick={() => fileRef.current?.click()} disabled={!live.ready} aria-label="เลือกไฟล์">＋</button>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && event.shiftKey && !event.nativeEvent.isComposing && live.ready && live.progress === 0 && (draft.trim() || file)) { event.preventDefault(); void sendCurrent(); } }} disabled={!live.ready} placeholder={live.ready ? "พิมพ์ข้อความ… · Shift + Enter เพื่อส่ง" : "รอการยืนยันช่องทาง"} aria-keyshortcuts="Shift+Enter" maxLength={20_000} rows={2} />
              <button className="send-now-button" onClick={() => void sendCurrent()} disabled={!live.ready || (!draft.trim() && !file) || live.progress > 0}>ส่ง</button>
            </div>
            <p className="transfer-limit-note">N2N v1.1.4 · ทั้งสองฝ่ายหยุด/ส่งต่อ/ยกเลิกได้ · Shift + Enter เพื่อส่ง · streaming สูงสุด 10 GB</p>
            {(error || live.error) && <p className="error-message room-error" role="alert">{error || live.error}</p>}
          </section>
        </section>
      )}
    </main>
  );
}
