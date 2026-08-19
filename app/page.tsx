import Link from "next/link";
import { SendPanel } from "@/components/SendPanel";

export default function Home() {
  return (
    <main className="site-shell">
      <nav className="topbar" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="N2N home">N2N<span>.</span></Link>
        <Link className="nav-link" href="/receive">รับไฟล์</Link>
      </nav>
      <div className="hero-grid">
        <section className="hero-copy">
          <p className="kicker"><span /> PRIVATE FILE TRANSFER</p>
          <h1>ไฟล์ของคุณ<br />อ่านได้แค่<br /><em>คนที่คุณเลือก</em></h1>
          <p className="hero-description">เข้ารหัสในเบราว์เซอร์ก่อนส่ง กุญแจไม่ถูกอัปโหลด และเซิร์ฟเวอร์ไม่เคยเห็นไฟล์ต้นฉบับ</p>
          <div className="trust-row">
            <span>◆ AES-256-GCM</span>
            <span>◆ NO SIGN-UP</span>
            <span>◆ ZERO PLAINTEXT</span>
          </div>
        </section>
        <SendPanel />
      </div>
      <footer className="site-footer">
        <span>ส่งไฟล์แบบ End-to-End Encrypted · สูงสุด 1 GB</span>
        <span>กุญแจอยู่หลัง # และไม่ถูกส่งไปยังเซิร์ฟเวอร์</span>
      </footer>
    </main>
  );
}
