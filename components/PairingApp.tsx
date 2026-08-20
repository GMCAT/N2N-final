"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";

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
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

export function PairingApp() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("choose");
  const [session, setSession] = useState<Session | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("waiting");
  const [peerOnline, setPeerOnline] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [draft, setDraft] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function heartbeat() {
      try {
        const status = await responseJson<{ status: RoomStatus; peerOnline: boolean }>(
          await fetch(`/api/rooms/${session?.id}/heartbeat`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session?.token}` },
          }),
        );
        if (active) {
          setRoomStatus(status.status);
          setPeerOnline(status.peerOnline);
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
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "เข้าร่วมห้องไม่สำเร็จ");
    } finally { setBusy(false); }
  }

  function reset() {
    setSession(null); setMode("choose"); setRoomStatus("waiting"); setPeerOnline(false);
    setCodeInput(""); setDraft(""); setFile(null); setError("");
  }

  const connected = roomStatus === "connected" && peerOnline;
  const code = session?.code ?? "";

  return (
    <main className="pair-shell">
      <nav className="topbar pair-topbar" aria-label="เมนูหลัก">
        <button className="brand brand-button" onClick={reset} aria-label="กลับหน้าแรก">N2N<span>.</span></button>
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
            <p className="expiry-note">ห้องหมดอายุ {new Date(session.expiresAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}</p>
            <button className="secondary-button leave-button" onClick={reset}>ออกจากห้อง</button>
          </aside>
          <section className="conversation" aria-label="พื้นที่รับส่งข้อมูล">
            <header className="conversation-header"><div><p className="eyebrow">PRIVATE CHANNEL</p><h2>ข้อความและไฟล์</h2></div><span className="security-chip">E2E · PENDING</span></header>
            <div className="message-stage" aria-live="polite"><div className="empty-conversation"><span className="channel-mark" aria-hidden="true">↔</span><strong>{connected ? "จับคู่สำเร็จ" : "ยังไม่มีใครอยู่อีกฝั่ง"}</strong><p>{connected ? "ระยะถัดไปจะสร้างกุญแจและเปิดการส่งข้อมูล" : "เมื่ออีกฝ่ายเข้าด้วยรหัสนี้ สถานะจะเปลี่ยนเป็นออนไลน์"}</p></div></div>
            {file && <div className="file-preview"><span>FILE</span><div><strong>{file.name}</strong><small>{formatBytes(file.size)}</small></div><button onClick={() => setFile(null)} aria-label="เอาไฟล์ออก">×</button></div>}
            <div className="composer">
              <input ref={fileRef} className="visually-hidden" type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null)} />
              <button className="attach-button" onClick={() => fileRef.current?.click()} disabled={!connected} aria-label="เลือกไฟล์">＋</button>
              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} disabled={!connected} placeholder={connected ? "พิมพ์ข้อความ…" : "รออีกฝ่ายออนไลน์"} rows={2} />
              <button className="send-now-button" disabled={!connected || (!draft.trim() && !file)}>ส่ง</button>
            </div>
            {error && <p className="error-message room-error" role="alert">{error}</p>}
          </section>
        </section>
      )}
    </main>
  );
}
