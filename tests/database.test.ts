import assert from "node:assert/strict";
import { test, after } from "node:test";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { db } from "../src/lib/db";
import { activityRepository as repo, ActivityError, type NewActivityInput } from "../src/lib/repositories/activity.repository";
import { canCreateActivity, LocalTestIdentityProvider, type CoreUserSession } from "../src/lib/auth/core-auth.adapter";

const url = new URL(process.env.DATABASE_URL!);
assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Integration tests only run against local PostgreSQL");
const prefix = `test-${randomUUID()}`;
const head: CoreUserSession = { coreUserId: `${prefix}-head`, displayName: "Integration test", coreRole: "STUDENT", isClassHead: true };
const student = (name: string): CoreUserSession => ({ ...head, coreUserId: `${prefix}-${name}`, isClassHead: false });
const input: NewActivityInput = { title: "[automated test]", description: "Temporary test record", category: "workshop", location: "Test", maxParticipants: 1,
  startAt: new Date("2026-10-10T02:00:00Z"), endAt: new Date("2026-10-10T05:00:00Z") };
const ids: string[] = [];
async function activity(capacity = 1) {
  const a = await repo.create(head, { ...input, maxParticipants: capacity }); ids.push(a.id); return a;
}
after(async () => {
  // Only delete exact records created by this test run, never user-created rows.
  await db.activity.deleteMany({ where: { id: { in: ids }, createdBy: head.coreUserId } });
  await db.$disconnect();
});

test("only heads create, local identity is disabled in production", async () => {
  await assert.rejects(repo.create(student("a"), input), ActivityError);
  assert.equal(canCreateActivity({ ...head, coreRole: "FACULTY" }), false);
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  try { env.NODE_ENV = "production"; assert.equal(await new LocalTestIdentityProvider().getCurrentUser(), null); }
  finally { if (previous === undefined) delete env.NODE_ENV; else env.NODE_ENV = previous; }
});
test("created activity is readable through an independent database connection", async () => {
  const a = await activity();
  const independent = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
  try {
    const stored = await independent.activity.findUniqueOrThrow({ where: { id: a.id } });
    assert.equal(stored.createdBy, head.coreUserId);
    assert.equal(stored.startAt.toISOString(), input.startAt.toISOString());
  } finally { await independent.$disconnect(); }
});
test("simultaneous registrations cannot overbook, cancellation reopens and permits re-registration", async () => {
  const a = await activity();
  const users = [student("alice"), student("bob")];
  const result = await Promise.allSettled(users.map(u => repo.register(a.id, u)));
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  const winner = users[result.findIndex(r => r.status === "fulfilled")];
  const loser = users[result.findIndex(r => r.status === "rejected")];
  assert.equal((await repo.findActivityById(a.id))?.currentParticipants, 1);
  assert.equal((await repo.findActivityById(a.id))?.status, "FULL");
  await assert.rejects(repo.cancelRegistration(a.id, loser), ActivityError);
  await repo.cancelRegistration(a.id, winner);
  assert.equal((await repo.findActivityById(a.id))?.status, "OPEN");
  await repo.register(a.id, loser);
});
test("duplicate concurrent submissions create one registration", async () => {
  const a = await activity(3), u = student("a");
  const results = await Promise.allSettled([repo.register(a.id, u), repo.register(a.id, u)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await repo.findActivityById(a.id))?.currentParticipants, 1);
  const personal = await repo.myActivities(u.coreUserId);
  assert.ok(personal.registrations.some(r => r.activityId === a.id));
});
test("closed statuses block registrations and cancellation", async () => {
  for (const status of ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const) {
    const a = await activity(2); await repo.register(a.id, student("a"));
    await repo.setStatus(a.id, status, head);
    await assert.rejects(repo.register(a.id, student("b")), ActivityError);
    await assert.rejects(repo.cancelRegistration(a.id, student("a")), ActivityError);
  }
});
test("ownership, capacity edits and FULL normalization are enforced", async () => {
  const a = await activity(2), other = student("other");
  await assert.rejects(repo.update(a.id, other, input), ActivityError);
  await assert.rejects(repo.setStatus(a.id, "COMPLETED", other), ActivityError);
  await assert.rejects(repo.setStatus(a.id, "FULL", head), ActivityError);
  await repo.register(a.id, student("a")); await repo.register(a.id, student("b"));
  await assert.rejects(repo.update(a.id, head, { ...input, maxParticipants: 1 }), ActivityError);
  await repo.update(a.id, head, { ...input, maxParticipants: 3 });
  assert.equal((await repo.findActivityById(a.id))?.status, "OPEN");
});
test("team quota, ownership, duplicate roles, and replay protections survive concurrent decisions", async () => {
  const a = await activity();
  const roleInput = { roleName: "Staff", description: "", maxMembers: 1 };
  await assert.rejects(repo.createRole(a.id, student("other"), roleInput), ActivityError);
  const role = await repo.createRole(a.id, head, roleInput);
  await assert.rejects(repo.createRole(a.id, head, { ...roleInput, roleName: "STAFF" }), ActivityError);
  const alice = await repo.applyForRole(a.id, role.id, student("a"));
  const bob = await repo.applyForRole(a.id, role.id, student("b"));
  await assert.rejects(repo.applyForRole(a.id, role.id, student("a")), ActivityError);
  await assert.rejects(repo.respond(a.id, alice.id, "ACCEPTED", student("other")), ActivityError);
  const results = await Promise.allSettled([alice, bob].map(app => repo.respond(a.id, app.id, "ACCEPTED", head)));
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const accepted = [alice, bob][results.findIndex(r => r.status === "fulfilled")];
  await assert.rejects(repo.respond(a.id, accepted.id, "REJECTED", head), ActivityError);
  assert.equal((await repo.listRoles(a.id))[0].currentMembers, 1);
  const otherActivity = await activity();
  await assert.rejects(repo.applyForRole(otherActivity.id, role.id, student("c")), ActivityError);
  await repo.setStatus(a.id, "COMPLETED", head);
  await assert.rejects(repo.createRole(a.id, head, { ...roleInput, roleName: "MC" }), ActivityError);
});
test("evaluation requires completion and registration and cannot be submitted twice", async () => {
  const a = await activity(), u = student("a"), feedback = { rating: 5, liked: "ดี", improvement: "เพิ่มเวลา" };
  await repo.register(a.id, u);
  await assert.rejects(repo.evaluate(a.id, u, feedback), ActivityError);
  await repo.setStatus(a.id, "COMPLETED", head);
  await assert.rejects(repo.evaluate(a.id, student("other"), feedback), ActivityError);
  const results = await Promise.allSettled([repo.evaluate(a.id, u, feedback), repo.evaluate(a.id, u, feedback)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await repo.listEvaluationsByActivity(a.id)).length, 1);
  assert.equal((await repo.participation(a.id, u.coreUserId)).hasEvaluated, true);
});
test("database rejects invalid capacity, dates, scores and duplicate registrations directly", async () => {
  const a = await activity();
  await assert.rejects(db.activity.update({ where: { id: a.id }, data: { maxParticipants: 0 } }));
  await assert.rejects(db.activity.update({ where: { id: a.id }, data: { endAt: input.startAt } }));
  await assert.rejects(db.evaluation.create({ data: { activityId: a.id, userId: student("x").coreUserId, rating: 6, liked: "a", improvement: "b" } }));
  await repo.register(a.id, student("a"));
  await assert.rejects(db.registration.create({ data: { activityId: a.id, userId: student("a").coreUserId } }));
});
