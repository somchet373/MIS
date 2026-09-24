import { db } from "../db";
import { canCreateActivity, type CoreUserSession } from "../auth/core-auth.adapter";
import type { Prisma, Activity, ActivityStatus } from "../../generated/prisma/client";
import type { ActivityItem } from "../../types/activity";

export class ActivityError extends Error {}
const fail = (message: string): never => { throw new ActivityError(message); };
const counts = { _count: { select: { registrations: true } } } as const;
type ActivityWithCount = Activity & { _count: { registrations: number } };
function present(a: ActivityWithCount): ActivityItem {
  return {
    id: a.id, title: a.title, description: a.description, category: a.category,
    startAt: a.startAt.toISOString(), endAt: a.endAt.toISOString(), location: a.location,
    maxParticipants: a.maxParticipants, currentParticipants: a._count.registrations,
    status: a.status, createdBy: a.createdBy, creatorName: a.creatorName,
    createdAt: a.createdAt.toISOString(),
  };
}
export type ActivityInput = Pick<ActivityItem, "title" | "description" | "category" | "location" | "maxParticipants">;
export type NewActivityInput = ActivityInput & { startAt: Date; endAt: Date };

function requireOwner(a: Activity, user: CoreUserSession) {
  if (a.createdBy !== user.coreUserId) fail("คุณไม่มีสิทธิ์จัดการกิจกรรมนี้");
}
function requireOpen(a: Activity) {
  if (a.status !== "OPEN" && a.status !== "FULL") fail("กิจกรรมนี้ปิดรับสมัครแล้ว");
}

// All mutations of an existing activity lock the same row before checking quotas.
// This transaction works across concurrent requests and multiple server processes.
async function locked<T>(id: string, work: (tx: Prisma.TransactionClient, a: ActivityWithCount) => Promise<T>): Promise<T> {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "activity_activities" WHERE "id" = ${id} FOR UPDATE`;
    const activity = await tx.activity.findUnique({ where: { id }, include: counts });
    if (!activity) return fail("ไม่พบกิจกรรมนี้ในระบบ");
    return work(tx, activity);
  }, { isolationLevel: "ReadCommitted", maxWait: 10000, timeout: 15000 });
}

export class PostgresActivityRepository {
  async listActivities(): Promise<ActivityItem[]> {
    return (await db.activity.findMany({ include: counts, orderBy: { createdAt: "desc" } })).map(present);
  }
  async findActivityById(id: string): Promise<ActivityItem | null> {
    const a = await db.activity.findUnique({ where: { id }, include: counts });
    return a ? present(a) : null;
  }
  async listRoles(activityId: string) {
    const roles = await db.activityRole.findMany({ where: { activityId }, include: {
      _count: { select: { applications: { where: { status: "ACCEPTED" } } } },
    }, orderBy: { roleName: "asc" } });
    return roles.map(r => ({ id: r.id, activityId: r.activityId, roleName: r.roleName,
      description: r.description, maxMembers: r.maxMembers, currentMembers: r._count.applications }));
  }
  listMembers(activityId: string) {
    return db.teamApplication.findMany({ where: { activityId }, orderBy: { createdAt: "asc" } });
  }
  listEvaluationsByActivity(activityId: string) {
    return db.evaluation.findMany({ where: { activityId }, orderBy: { createdAt: "asc" } });
  }
  async participation(activityId: string, userId?: string) {
    if (!userId) return { myApplication: null, isRegistered: false, hasEvaluated: false };
    const where = { activityId_userId: { activityId, userId } };
    const [myApplication, registration, evaluation] = await Promise.all([
      db.teamApplication.findUnique({ where }), db.registration.findUnique({ where }),
      db.evaluation.findUnique({ where, select: { id: true } }),
    ]);
    return { myApplication, isRegistered: !!registration, hasEvaluated: !!evaluation };
  }
  async myActivities(userId: string) {
    const [created, registrations, applications] = await Promise.all([
      db.activity.findMany({ where: { createdBy: userId }, include: counts, orderBy: { createdAt: "desc" } }),
      db.registration.findMany({ where: { userId }, include: { activity: { include: counts } }, orderBy: { createdAt: "desc" } }),
      db.teamApplication.findMany({ where: { userId }, include: { activity: true, role: true }, orderBy: { createdAt: "desc" } }),
    ]);
    return { created: created.map(present), registrations: registrations.map(r => ({ ...r, activity: present(r.activity) })), applications };
  }
  async create(user: CoreUserSession, input: NewActivityInput) {
    if (!canCreateActivity(user)) return fail("เฉพาะนักศึกษาที่เป็นหัวหน้าห้องเท่านั้นที่สร้างกิจกรรมได้");
    return db.activity.create({ data: { ...input, createdBy: user.coreUserId, creatorName: user.displayName } });
  }
  createRole(id: string, user: CoreUserSession, input: { roleName: string; description: string; maxMembers: number }) {
    return locked(id, async (tx, a) => {
      requireOwner(a, user); requireOpen(a);
      const nameKey = input.roleName.toLowerCase();
      if (await tx.activityRole.findUnique({ where: { activityId_nameKey: { activityId: id, nameKey } } })) return fail("มีตำแหน่งชื่อนี้ในกิจกรรมแล้ว");
      return tx.activityRole.create({ data: { ...input, nameKey, activityId: id } });
    });
  }
  register(id: string, user: CoreUserSession) {
    return locked(id, async (tx, a) => {
      const where = { activityId_userId: { activityId: id, userId: user.coreUserId } };
      if (await tx.registration.findUnique({ where })) return fail("คุณลงทะเบียนกิจกรรมนี้แล้ว");
      requireOpen(a);
      if (a.status === "FULL" || a._count.registrations >= a.maxParticipants) return fail("ที่นั่งสำหรับกิจกรรมนี้เต็มแล้ว");
      await tx.registration.create({ data: { activityId: id, userId: user.coreUserId } });
      if (a._count.registrations + 1 === a.maxParticipants) await tx.activity.update({ where: { id }, data: { status: "FULL" } });
    });
  }
  cancelRegistration(id: string, user: CoreUserSession) {
    return locked(id, async (tx, a) => {
      requireOpen(a);
      const where = { activityId_userId: { activityId: id, userId: user.coreUserId } };
      if (!await tx.registration.findUnique({ where })) return fail("ไม่พบการลงทะเบียนของคุณในกิจกรรมนี้");
      await tx.registration.delete({ where });
      if (a.status === "FULL") await tx.activity.update({ where: { id }, data: { status: "OPEN" } });
    });
  }
  applyForRole(id: string, roleId: string, user: CoreUserSession) {
    return locked(id, async (tx, a) => {
      requireOpen(a);
      const role = await tx.activityRole.findFirst({ where: { id: roleId, activityId: id } });
      if (!role) return fail("ไม่พบตำแหน่งทีมงานในกิจกรรมนี้");
      if (await tx.teamApplication.findUnique({ where: { activityId_userId: { activityId: id, userId: user.coreUserId } } })) return fail("คุณได้ส่งใบสมัครทีมงานในกิจกรรมนี้แล้ว");
      return tx.teamApplication.create({ data: { activityId: id, roleId, userId: user.coreUserId, userName: user.displayName } });
    });
  }
  respond(id: string, applicationId: string, status: "ACCEPTED" | "REJECTED", user: CoreUserSession) {
    return locked(id, async (tx, a) => {
      requireOwner(a, user); requireOpen(a);
      const application = await tx.teamApplication.findFirst({ where: { id: applicationId, activityId: id }, include: { role: true } });
      if (!application) return fail("ไม่พบใบสมัครนี้");
      if (application.status !== "PENDING") return fail("ใบสมัครนี้ได้รับการพิจารณาแล้ว");
      const accepted = await tx.teamApplication.count({ where: { roleId: application.roleId, status: "ACCEPTED" } });
      if (status === "ACCEPTED" && accepted >= application.role.maxMembers) return fail("ตำแหน่งนี้มีทีมงานครบตามจำนวนแล้ว");
      await tx.teamApplication.update({ where: { id: applicationId }, data: { status } });
    });
  }
  setStatus(id: string, status: ActivityStatus, user: CoreUserSession) {
    return locked(id, async (tx, a) => {
      requireOwner(a, user);
      const full = a._count.registrations >= a.maxParticipants;
      if (status === "FULL" && !full) return fail("ยังมีที่นั่งว่าง ไม่สามารถกำหนดสถานะที่นั่งเต็ม");
      await tx.activity.update({ where: { id }, data: { status: status === "OPEN" && full ? "FULL" : status } });
    });
  }
  evaluate(id: string, user: CoreUserSession, input: { rating: number; liked: string; improvement: string }) {
    return locked(id, async (tx, a) => {
      if (a.status !== "COMPLETED") return fail("ประเมินได้เมื่อกิจกรรมสิ้นสุดแล้วเท่านั้น");
      const where = { activityId_userId: { activityId: id, userId: user.coreUserId } };
      if (!await tx.registration.findUnique({ where })) return fail("เฉพาะผู้ที่ลงทะเบียนเข้าร่วมกิจกรรมนี้เท่านั้นที่ประเมินได้");
      if (await tx.evaluation.findUnique({ where })) return fail("คุณได้ส่งแบบประเมินกิจกรรมนี้แล้ว");
      await tx.evaluation.create({ data: { ...input, activityId: id, userId: user.coreUserId } });
    });
  }
  update(id: string, user: CoreUserSession, input: ActivityInput) {
    return locked(id, async (tx, a) => {
      requireOwner(a, user);
      if (input.maxParticipants < a._count.registrations) return fail("จำนวนที่เปิดรับต้องไม่น้อยกว่าผู้ที่ลงทะเบียนแล้ว");
      const status = ["OPEN", "FULL"].includes(a.status)
        ? (a._count.registrations >= input.maxParticipants ? "FULL" : "OPEN") : a.status;
      await tx.activity.update({ where: { id }, data: { ...input, status } });
    });
  }
}

export type ActivityRepository = Pick<PostgresActivityRepository, keyof PostgresActivityRepository>;
export const activityRepository: ActivityRepository = new PostgresActivityRepository();
