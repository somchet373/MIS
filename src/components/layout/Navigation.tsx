"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function Navigation({ canCreate = false }: { canCreate?: boolean }) {
  const pathname = usePathname();
  return <header className="site-header"><div className="nav-inner">
    <Link href="/" className="brand" aria-label="CSMJU2030 หน้ารวมกิจกรรม"><span className="brand-mark" aria-hidden="true">C<span>2030</span></span><span><strong>CSMJU2030</strong><small>พื้นที่กิจกรรมของนักศึกษา</small></span></Link>
    <nav aria-label="เมนูหลัก" className="main-nav">
      <Link href="/" aria-current={pathname === "/" ? "page" : undefined}>สำรวจกิจกรรม</Link>
      <Link href="/my-activities" aria-current={pathname === "/my-activities" ? "page" : undefined}>กิจกรรมของฉัน</Link>
    </nav>
    {canCreate && <Link href="/activities/create" className="primary-link">+ สร้างกิจกรรม</Link>}
  </div></header>;
}
