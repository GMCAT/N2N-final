import Link from "next/link";
import { ReceivePanel } from "@/components/ReceivePanel";

export default function ReceivePage() {
  return (
    <main className="site-shell receive-page">
      <nav className="topbar" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="N2N home">N2N<span>.</span></Link>
        <Link className="nav-link" href="/">ส่งไฟล์</Link>
      </nav>
      <div className="receive-layout">
        <section className="hero-copy compact-copy">
          <p className="kicker"><span /> LOCAL DECRYPTION</p>
          <h1>รับไฟล์<br /><em>อย่างเป็นส่วนตัว</em></h1>
          <p className="hero-description">เลือกแพ็กเกจจากผู้ส่ง ระบบจะยืนยันว่าไฟล์ไม่ถูกแก้ไขและถอดรหัสภายในอุปกรณ์นี้เท่านั้น</p>
          <p className="privacy-note">หากกุญแจหรือแพ็กเกจไม่ถูกต้อง ระบบจะไม่สร้างไฟล์ผลลัพธ์</p>
        </section>
        <ReceivePanel />
      </div>
    </main>
  );
}

