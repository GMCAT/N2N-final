"use client";

import { ChangeEvent, DragEvent, useRef, useState } from "react";
import { createChunkPlan, MAX_CHUNKED_FILE_BYTES } from "@/lib/chunked-crypto";
import { createReceiveLink } from "@/lib/share-link";

type ReadyTransfer = {
  id: string;
  shareLink: string;
  deleteToken: string;
  expiresAt: number;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = await response.json() as T & { error?: string };
  if (!response.ok) throw new Error(payload.error ?? "Transfer request failed");
  return payload;
}

export function SendPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "encrypting" | "uploading" | "ready" | "deleting">("idle");
  const [error, setError] = useState("");
  const [ready, setReady] = useState<ReadyTransfer | null>(null);
  const [copied, setCopied] = useState(false);
  const [expiresInSeconds, setExpiresInSeconds] = useState(24 * 60 * 60);
  const [downloadLimit, setDownloadLimit] = useState(1);
  const [progress, setProgress] = useState(0);

  function chooseFile(nextFile?: File) {
    if (!nextFile) return;
    setError("");
    setCopied(false);
    setFile(nextFile);
    setStatus("idle");
    setReady(null);
    setProgress(0);
  }

  async function uploadPart(url: string, part: Uint8Array, signal: AbortSignal) {
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await responseJson(await fetch(url, {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" },
          body: part as BodyInit,
          signal,
        }));
      } catch (error) {
        if (signal.aborted) throw new DOMException("Transfer cancelled", "AbortError");
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
      }
    }
    throw lastError;
  }

  async function prepareTransfer() {
    if (!file) return;
    setError("");
    setStatus("encrypting");
    try {
      const plan = await createChunkPlan(file);
      setStatus("uploading");
      const controller = new AbortController();
      abortRef.current = controller;
      const created = await responseJson<{
        id: string;
        uploadUrl: string;
        completeUrl: string;
        partUploadBaseUrl: string;
        deleteToken: string;
        expiresAt: number;
      }>(await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          encryptedSize: plan.encryptedSize,
          expiresInSeconds,
          downloadLimit,
          formatVersion: 2,
          fileId: plan.fileId,
          partCount: plan.partCount,
        }),
      }));

      await uploadPart(`${created.partUploadBaseUrl}/0`, plan.metadataPart, controller.signal);
      setProgress(1 / plan.partCount);
      for (let index = 0; index < plan.contentChunkCount; index += 1) {
        if (controller.signal.aborted) throw new DOMException("Transfer cancelled", "AbortError");
        const encryptedChunk = await plan.encryptContentChunk(index);
        await uploadPart(`${created.partUploadBaseUrl}/${index + 1}`, encryptedChunk, controller.signal);
        setProgress((index + 2) / plan.partCount);
      }
      await responseJson(await fetch(created.completeUrl, { method: "POST", signal: controller.signal }));

      setReady({
        id: created.id,
        deleteToken: created.deleteToken,
        expiresAt: created.expiresAt,
        shareLink: createReceiveLink(created.id, plan.key, window.location.origin),
      });
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof DOMException && caught.name === "AbortError" ? "ยกเลิกการส่งแล้ว" : caught instanceof Error ? caught.message : "Transfer failed");
      setStatus("idle");
    } finally {
      abortRef.current = null;
    }
  }

  async function copyLink() {
    if (!ready) return;
    await navigator.clipboard.writeText(ready.shareLink);
    setCopied(true);
  }

  async function removeTransfer() {
    if (!ready) return;
    setStatus("deleting");
    try {
      await responseJson(await fetch(`/api/transfers/${ready.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${ready.deleteToken}` },
      }));
      setReady(null);
      setFile(null);
      setStatus("idle");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed");
      setStatus("ready");
    }
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    chooseFile(event.dataTransfer.files[0]);
  }

  const busy = status === "encrypting" || status === "uploading";

  return (
    <section className="transfer-card" aria-labelledby="send-title">
      <div className="card-heading">
        <span className="step-badge">01</span>
        <div>
          <p className="eyebrow">SEND A FILE</p>
          <h2 id="send-title">เข้ารหัสก่อนออกจากเครื่อง</h2>
        </div>
      </div>

      <div
        className={`drop-zone ${file ? "has-file" : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") inputRef.current?.click();
        }}
        role="button"
        tabIndex={0}
      >
        <input ref={inputRef} className="visually-hidden" type="file" onChange={(event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0])} />
        <span className="drop-mark" aria-hidden="true">＋</span>
        {file ? (
          <><strong>{file.name}</strong><span>{formatBytes(file.size)} · พร้อมเข้ารหัสและอัปโหลด</span></>
        ) : (
          <><strong>วางไฟล์ตรงนี้ หรือกดเพื่อเลือก</strong><span>แบ่งเข้ารหัสทีละ 4 MB · รองรับสูงสุด {formatBytes(MAX_CHUNKED_FILE_BYTES)}</span></>
        )}
      </div>

      {!ready && (
        <div className="policy-grid">
          <label>อายุลิงก์
            <select value={expiresInSeconds} onChange={(event) => setExpiresInSeconds(Number(event.target.value))}>
              <option value={3600}>1 ชั่วโมง</option>
              <option value={86400}>1 วัน</option>
              <option value={604800}>7 วัน</option>
            </select>
          </label>
          <label>ดาวน์โหลดได้
            <select value={downloadLimit} onChange={(event) => setDownloadLimit(Number(event.target.value))}>
              <option value={1}>1 ครั้ง</option>
              <option value={3}>3 ครั้ง</option>
              <option value={10}>10 ครั้ง</option>
            </select>
          </label>
        </div>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}

      {busy && (
        <div className="progress-block" aria-live="polite">
          <div><span>{status === "encrypting" ? "เตรียมกุญแจ" : "อัปโหลด ciphertext"}</span><strong>{Math.round(progress * 100)}%</strong></div>
          <progress max="1" value={progress} />
          {status === "uploading" && <button className="cancel-button" onClick={() => abortRef.current?.abort()}>ยกเลิก</button>}
        </div>
      )}

      {!ready ? (
        <button className="primary-button" disabled={!file || busy} onClick={prepareTransfer}>
          {status === "encrypting" ? "กำลังเข้ารหัส…" : status === "uploading" ? "กำลังส่ง ciphertext…" : "เข้ารหัสและสร้างลิงก์"}
        </button>
      ) : (
        <div className="ready-box" aria-live="polite">
          <div>
            <span className="status-dot" aria-hidden="true" />
            <strong>ลิงก์พร้อมส่ง</strong>
            <p>หมดอายุ {new Date(ready.expiresAt).toLocaleString("th-TH")} · เซิร์ฟเวอร์เก็บเฉพาะ ciphertext</p>
          </div>
          <label className="share-link-label" htmlFor="share-link">ลิงก์สำหรับผู้รับ</label>
          <input id="share-link" className="share-link-input" value={ready.shareLink} readOnly spellCheck={false} />
          <div className="button-row">
            <button className="primary-button" onClick={copyLink}>{copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}</button>
            <button className="secondary-button danger-button" disabled={status === "deleting"} onClick={removeTransfer}>{status === "deleting" ? "กำลังลบ…" : "ลบไฟล์"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
