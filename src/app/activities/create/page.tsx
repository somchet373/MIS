import Link from "next/link";
import { coreAuth, canCreateActivity } from "@/lib/auth/core-auth.adapter";
import { CreateActivityForm } from "@/components/activities/CreateActivityForm";

export default async function CreateActivityPage() {
  const user = await coreAuth.getCurrentUser();
  return <main className="dashboard-shell">
    <div className="space-y-4">
      <Link href="/my-activities" className="text-primary text-sm hover:underline">← กลับไปกิจกรรมของฉัน</Link>
      <div className="page-intro"><div><p className="eyebrow">CREATE AN ACTIVITY</p><h1>เริ่มต้นกิจกรรมของคุณ</h1><p className="muted">เปลี่ยนไอเดียให้เป็นประสบการณ์ที่ทุกคนได้มีส่วนร่วม · ช่องที่มี * จำเป็นต้องกรอก</p></div></div>
    </div>
    {canCreateActivity(user) ? <CreateActivityForm /> : <div className="empty-panel"><h2>{user ? "เฉพาะนักศึกษาที่เป็นหัวหน้าห้องเท่านั้นที่สร้างกิจกรรมได้" : "กรุณาเข้าสู่ระบบผ่าน CSMJU2030 ก่อนสร้างกิจกรรม"}</h2><Link href="/" className="secondary-link">สำรวจกิจกรรม →</Link></div>}
  </main>;
}
