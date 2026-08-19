import Link from "next/link";
import { RemoteReceivePanel } from "@/components/RemoteReceivePanel";

export default async function ReceiveTransferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="site-shell receive-page">
      <nav className="topbar" aria-label="Main navigation">
        <Link className="brand" href="/" aria-label="N2N home">N2N<span>.</span></Link>
        <Link className="nav-link" href="/">ส่งไฟล์</Link>
      </nav>
      <div className="receive-layout">
        <section className="hero-copy compact-copy">
          <p className="kicker"><span /> CIPHERTEXT DELIVERY</p>
          <h1>ไฟล์มาถึง<br /><em>โดยไม่มีใครอ่าน</em></h1>
          <p className="hero-description">เซิร์ฟเวอร์ส่งเฉพาะแพ็กเกจเข้ารหัส เบราว์เซอร์ของคุณใช้กุญแจหลัง # เพื่อตรวจสอบและถอดรหัส</p>
          <p className="privacy-note">การกดรับจะนับเป็นหนึ่งครั้งตามขีดจำกัดที่ผู้ส่งตั้งไว้</p>
        </section>
        <RemoteReceivePanel transferId={id} />
      </div>
    </main>
  );
}

