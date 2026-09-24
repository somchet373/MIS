import { Navigation } from "@/components/layout/Navigation";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { coreAuth, canCreateActivity } from "@/lib/auth/core-auth.adapter";

export const dynamic = "force-dynamic";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "กิจกรรมนักศึกษา | CSMJU2030",
  description: "วางแผนกิจกรรม ร่วมทีม และพัฒนากิจกรรมนักศึกษาไปด้วยกัน",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await coreAuth.getCurrentUser();
  return (
    <html
      lang="th"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col"><a href="#main-content" className="skip-link">ข้ามไปเนื้อหา</a><Navigation canCreate={canCreateActivity(user)} />{process.env.NODE_ENV !== "production" && <p className="bg-secondary text-primary text-sm leading-relaxed px-6 py-2 text-center">โหมดพัฒนา · {user?.displayName ?? "ไม่ได้เลือกผู้ใช้ทดสอบ"} · บันทึกข้อมูลในฐานข้อมูล local</p>}<div id="main-content" className="flex-1" tabIndex={-1}>{children}</div><footer className="site-footer">CSMJU2030 · Activity Planning &amp; Improvement System<br />สาขาวิทยาการคอมพิวเตอร์ คณะวิทยาศาสตร์ มหาวิทยาลัยแม่โจ้</footer></body>
    </html>
  );
}
