"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { decryptPackage, FileMetadata } from "@/lib/crypto";
import { readKeyFromFragment } from "@/lib/share-link";

export function ReceivePanel() {
  const [key, setKey] = useState("");
  const [packageFile, setPackageFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "decrypting" | "ready">("idle");
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ url: string; metadata: FileMetadata } | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setKey(readKeyFromFragment(window.location.hash) ?? ""));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  async function decrypt() {
    if (!packageFile || !key) return;
    setStatus("decrypting");
    setError("");
    try {
      const decrypted = await decryptPackage(await packageFile.arrayBuffer(), key);
      setResult((previous) => {
        if (previous) URL.revokeObjectURL(previous.url);
        return {
          url: URL.createObjectURL(new Blob([decrypted.bytes as BlobPart], { type: decrypted.metadata.type })),
          metadata: decrypted.metadata,
        };
      });
      setStatus("ready");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Decryption failed");
      setStatus("idle");
    }
  }

  return (
    <section className="transfer-card receive-card" aria-labelledby="receive-title">
      <div className="card-heading">
        <span className="step-badge">02</span>
        <div>
          <p className="eyebrow">RECEIVE A FILE</p>
          <h2 id="receive-title">ถอดรหัสบนเครื่องของคุณ</h2>
        </div>
      </div>

      <label className="field-label" htmlFor="key">กุญแจจากลิงก์</label>
      <input
        id="key"
        className="key-input"
        type="password"
        value={key}
        onChange={(event) => setKey(event.target.value.trim())}
        autoComplete="off"
        spellCheck={false}
        placeholder="เปิดลิงก์ของผู้ส่ง หรือวางกุญแจที่นี่"
      />

      <label className="package-picker">
        <span>{packageFile ? packageFile.name : "เลือกไฟล์แพ็กเกจ .n2n"}</span>
        <input
          className="visually-hidden"
          type="file"
          accept=".n2n,application/vnd.n2n.encrypted+json"
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setPackageFile(event.target.files?.[0] ?? null);
            setError("");
            setResult(null);
          }}
        />
      </label>

      {error && <p className="error-message" role="alert">{error}</p>}

      {result ? (
        <div className="ready-box">
          <div>
            <span className="status-dot" aria-hidden="true" />
            <strong>ยืนยันความถูกต้องและถอดรหัสแล้ว</strong>
            <p>{result.metadata.name}</p>
          </div>
          <a className="primary-button" href={result.url} download={result.metadata.name}>บันทึกไฟล์</a>
        </div>
      ) : (
        <button className="primary-button" disabled={!packageFile || !key || status === "decrypting"} onClick={decrypt}>
          {status === "decrypting" ? "กำลังตรวจสอบและถอดรหัส…" : "ถอดรหัสไฟล์"}
        </button>
      )}
    </section>
  );
}
