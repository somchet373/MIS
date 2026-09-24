"use server";

import { revalidatePath } from "next/cache";
import { coreAuth, canCreateActivity, type CoreUserSession } from "@/lib/auth/core-auth.adapter";
import { activityRepository as repository, ActivityError, type ActivityInput } from "@/lib/repositories/activity.repository";

type ActionResult = { success: boolean; error?: string; activityId?: string };
const text = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
};
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new ActivityError(message);
}
function readActivity(form: FormData): ActivityInput {
  const title = text(form, "title"), description = text(form, "description");
  const location = text(form, "location"), category = text(form, "category");
  const raw = text(form, "maxParticipants"), maxParticipants = Number(raw);
  assert(title && description && location && title.length <= 150 && description.length <= 5000 && location.length <= 200,
    "กรุณากรอกชื่อ สถานที่ และรายละเอียดให้ครบและไม่เกินจำนวนตัวอักษรที่กำหนด");
  assert(category && category.length <= 150, "กรุณาระบุหมวดหมู่กิจกรรม และความยาวต้องไม่เกิน 150 ตัวอักษร");
  assert(/^\d+$/.test(raw) && Number.isSafeInteger(maxParticipants) && maxParticipants >= 1 && maxParticipants <= 2147483647,
    "จำนวนผู้เข้าร่วมต้องเป็นจำนวนเต็มอย่างน้อย 1 คน และไม่เกิน 2,147,483,647 คน");
  return { title, description, location, category, maxParticipants };
}
function localDate(value: string): Date {
  const date = new Date(value + "Z");
  assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 16) === value,
    "กรุณาระบุวันและเวลาเริ่มต้นและสิ้นสุดให้ถูกต้อง");
  return new Date(value + "+07:00");
}
function refresh(id?: string) {
  revalidatePath("/"); revalidatePath("/my-activities");
  if (id) {
    revalidatePath(`/activities/${id}`);
    revalidatePath(`/organizer/${id}/manage`);
    revalidatePath(`/organizer/${id}/summary`);
  }
}
async function run(work: (user: CoreUserSession) => Promise<string | void>): Promise<ActionResult> {
  try {
    const user = await coreAuth.getCurrentUser();
    assert(user, "กรุณาเข้าสู่ระบบผ่าน CSMJU2030");
    const id = await work(user);
    refresh(id || undefined);
    return { success: true, ...(id ? { activityId: id } : {}) };
  } catch (error) {
    if (error instanceof ActivityError) return { success: false, error: error.message };
    console.error("Activity operation failed", error instanceof Error ? error.name : "UnknownError");
    return { success: false, error: "บันทึกไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูลแล้วลองใหม่" };
  }
}

export async function createActivityAction(form: FormData) {
  return run(async user => {
    assert(canCreateActivity(user), "เฉพาะนักศึกษาที่เป็นหัวหน้าห้องเท่านั้นที่สร้างกิจกรรมได้");
    const input = readActivity(form);
    const startAt = localDate(text(form, "startAt")), endAt = localDate(text(form, "endAt"));
    assert(endAt > startAt, "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่มต้น");
    return (await repository.create(user, { ...input, startAt, endAt })).id;
  });
}
export async function createActivityRoleAction(id: string, form: FormData) {
  return run(async user => {
    const roleName = text(form, "roleName"), description = text(form, "roleDescription");
    const maxMembers = Number(text(form, "maxMembers"));
    assert(roleName && roleName.length <= 100 && description.length <= 500, "กรุณากรอกชื่อตำแหน่งและรายละเอียดไม่เกินจำนวนตัวอักษรที่กำหนด");
    assert(Number.isSafeInteger(maxMembers) && maxMembers >= 1 && maxMembers <= 999, "จำนวนทีมงานต้องเป็นจำนวนเต็มระหว่าง 1–999 คน");
    await repository.createRole(id, user, { roleName, description, maxMembers }); return id;
  });
}
export async function registerActivityAction(id: string) {
  return run(async user => {
    assert(typeof id === "string" && id.trim(), "รหัสกิจกรรมไม่ถูกต้อง");
    await repository.register(id, user); return id;
  });
}
export async function cancelRegistrationAction(id: string) {
  return run(async user => {
    assert(typeof id === "string" && id.trim(), "รหัสกิจกรรมไม่ถูกต้อง");
    await repository.cancelRegistration(id, user); return id;
  });
}
export async function applyTeamRoleAction(id: string, roleId: string) {
  return run(async user => { await repository.applyForRole(id, roleId, user); return id; });
}
export async function respondTeamApplicationAction(id: string, applicationId: string, status: "ACCEPTED" | "REJECTED") {
  return run(async user => {
    assert(status === "ACCEPTED" || status === "REJECTED", "ผลการพิจารณาไม่ถูกต้อง");
    await repository.respond(id, applicationId, status, user); return id;
  });
}
export async function updateActivityStatusAction(id: string, status: unknown) {
  return run(async user => {
    assert(status === "OPEN" || status === "FULL" || status === "IN_PROGRESS" || status === "COMPLETED" || status === "CANCELLED", "สถานะกิจกรรมไม่ถูกต้อง");
    await repository.setStatus(id, status, user); return id;
  });
}
export async function submitEvaluationAction(form: FormData) {
  return run(async user => {
    const id = text(form, "activityId"), raw = text(form, "rating");
    const liked = text(form, "liked"), improvement = text(form, "improvement");
    assert(id && /^[1-5]$/.test(raw), "ข้อมูลไม่ถูกต้อง กรุณาเลือกคะแนน 1–5 และกรอกข้อความ");
    assert(liked && improvement && liked.length <= 2000 && improvement.length <= 2000, "กรุณากรอกคำชมและข้อเสนอแนะอย่างละ 1–2000 ตัวอักษร");
    await repository.evaluate(id, user, { rating: Number(raw), liked, improvement }); return id;
  });
}
export async function updateActivityAction(form: FormData) {
  return run(async user => {
    const id = text(form, "activityId");
    assert(id, "รหัสกิจกรรมไม่ถูกต้อง");
    await repository.update(id, user, readActivity(form)); return id;
  });
}