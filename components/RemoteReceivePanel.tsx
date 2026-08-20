"use client";

import { useEffect, useState } from "react";
import { decryptPackage, FileMetadata } from "@/lib/crypto";
import { decryptChunkContainer } from "@/lib/chunked-crypto";
import { readKeyFromFragment } from "@/lib/share-link";

type TransferInfo = {
  encryptedSize: number;
  expiresAt: number;
  downloadsRemaining: number;
  formatVersion: number;
  partCount: number;
};

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json() as { error?: string };
    return payload.error ?? "Transfer request failed";
  } catch {
    return "Transfer request failed";
  }
}

export function RemoteReceivePanel({ transferId }: { transferId: string }) {
  const [key, setKey] = useState("");
  const [transfer, setTransfer] = useState<TransferInfo | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "downloading" | "ready">("loading");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; metadata: FileMetadata } | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const frame = requestAnimationFrame(() => setKey(readKeyFromFragment(window.location.hash) ?? ""));
    fetch(`/api/transfers/${encodeURIComponent(transferId)}`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(await errorMessage(response));
        return response.json() as Promise<{ transfer: TransferInfo }>;
      })
      .then((payload) => {
        setTransfer(payload.transfer);
        setStatus("idle");
      })
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Transfer unavailable");
        setStatus("idle");
      });
    return () => {
      cancelAnimationFrame(frame);
      controller.abort();
    };
  }, [transferId]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  async function receive() {
    if (!key || !transfer) return;
    setStatus("downloading");
    setError("");
    try {
      const response = await fetch(`/api/transfers/${encodeURIComponent(transferId)}/download`, { method: "POST" });
      if (!response.ok) throw new Error(await errorMessage(response));
      const total = Number(response.headers.get("content-length")) || 0;
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Streaming download is unavailable");
      const chunks: Uint8Array[] = [];
      let received = 0;
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        chunks.push(chunk.value);
        received += chunk.value.byteLength;
        if (total) setProgress(received / total);
      }
      const packageBytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) { packageBytes.set(chunk, offset); offset += chunk.byteLength; }
      const decrypted = transfer.formatVersion === 2
        ? await decryptChunkContainer(packageBytes, key)
        : await decryptPackage(packageBytes, key).then(({ bytes, metadata }) => ({ blob: new Blob([bytes as BlobPart], { type: metadata.type }), metadata }));
      setResult({
        url: URL.createObjectURL(decrypted.blob),
        metadata: decrypted.metadata,
      });
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to receive transfer");
      setStatus("idle");
    }
  }

  return (
    <section className="transfer-card receive-card" aria-labelledby="receive-title">
      <div className="card-heading">
        <span className="step-badge">02</span>
        <div><p className="eyebrow">RECEIVE A FILE</p><h2 id="receive-title">รับ ciphertext และถอดรหัส</h2></div>
      </div>

      {status === "loading" && <p className="loading-message" role="status">กำลังตรวจสอบลิงก์…</p>}

      {transfer && !result && (
        <>
          <div className="transfer-facts">
            <span>แพ็กเกจเข้ารหัส {(transfer.encryptedSize / 1024 / 1024).toFixed(2)} MB</span>
            <span>เหลือ {transfer.downloadsRemaining} ครั้ง</span>
            <span>หมดอายุ {new Date(transfer.expiresAt).toLocaleString("th-TH")}</span>
          </div>
          <label className="field-label" htmlFor="remote-key">กุญแจจากลิงก์</label>
          <input id="remote-key" className="key-input" type="password" value={key} onChange={(event) => setKey(event.target.value.trim())} autoComplete="off" spellCheck={false} placeholder="ไม่พบกุญแจในส่วน # ของลิงก์" />
          <button className="primary-button" disabled={!key || status === "downloading"} onClick={receive}>
            {status === "downloading" ? "กำลังรับและตรวจสอบ…" : "รับและถอดรหัสไฟล์"}
          </button>
          {status === "downloading" && (
            <div className="progress-block" aria-live="polite">
              <div><span>รับ ciphertext</span><strong>{Math.round(progress * 100)}%</strong></div>
              <progress max="1" value={progress} />
            </div>
          )}
        </>
      )}

      {error && <p className="error-message" role="alert">{error}</p>}

      {result && (
        <div className="ready-box">
          <div><span className="status-dot" aria-hidden="true" /><strong>ตรวจสอบและถอดรหัสแล้ว</strong><p>{result.metadata.name}</p></div>
          <a className="primary-button" href={result.url} download={result.metadata.name}>บันทึกไฟล์</a>
        </div>
      )}
    </section>
  );
}
