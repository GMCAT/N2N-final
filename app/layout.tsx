import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const productionUrl = "https://n2n-final.kumaikinpuck.workers.dev";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  metadataBase: new URL(productionUrl),
  applicationName: "N2N Private Transfer",
  title: {
    default: "N2N Private Transfer — ส่งไฟล์เข้ารหัสแบบ P2P",
    template: "%s | N2N Private Transfer",
  },
  description:
    "ส่งไฟล์และข้อความแบบเข้ารหัสจากต้นทางถึงปลายทางผ่าน WebRTC P2P จับคู่ด้วยรหัส 8 หลัก ไม่ต้องสมัครสมาชิก และไม่พักไฟล์บนเซิร์ฟเวอร์",
  keywords: [
    "N2N Private Transfer",
    "ส่งไฟล์ออนไลน์",
    "ส่งไฟล์เข้ารหัส",
    "ส่งไฟล์ P2P",
    "โอนไฟล์ไม่ผ่านเซิร์ฟเวอร์",
    "encrypted file transfer",
    "peer to peer file transfer",
    "WebRTC file transfer",
  ],
  alternates: { canonical: "/", languages: { "th-TH": "/" } },
  openGraph: {
    type: "website",
    locale: "th_TH",
    url: "/",
    siteName: "N2N Private Transfer",
    title: "N2N Private Transfer — ส่งไฟล์เข้ารหัสแบบ P2P",
    description:
      "ส่งไฟล์และข้อความโดยตรงระหว่างเบราว์เซอร์ จับคู่ด้วยรหัส 8 หลัก ไม่ต้องสมัครสมาชิก",
  },
  twitter: {
    card: "summary",
    title: "N2N Private Transfer",
    description:
      "ส่งไฟล์และข้อความแบบเข้ารหัสโดยตรงระหว่างเบราว์เซอร์ผ่าน WebRTC P2P",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "N2N Private Transfer",
    url: productionUrl,
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any modern web browser",
    inLanguage: "th",
    description:
      "บริการส่งไฟล์และข้อความแบบเข้ารหัสจากต้นทางถึงปลายทางผ่าน WebRTC P2P โดยไม่ต้องสมัครสมาชิก",
    offers: { "@type": "Offer", price: "0", priceCurrency: "THB" },
  };

  return (
    <html lang="th">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
      </body>
    </html>
  );
}
