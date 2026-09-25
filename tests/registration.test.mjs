import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Test the actual Server Action boundary; database invariants run separately against PostgreSQL.
function setup() {
  const session = { user: { coreUserId: 'head', displayName: 'Head', coreRole: 'STUDENT', isClassHead: true } };
  const calls = [], invalidated = [];
  class ActivityError extends Error {}
  const repository = new Proxy({}, { get: (_target, method) => async (...args) => {
    calls.push({ method, args }); return { id: 'saved' };
  } });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(new URL('../src/app/actions/activity.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, console,
    require(name) {
      if (name === 'next/cache') return { revalidatePath: path => invalidated.push(path) };
      if (name === '@/lib/auth/core-auth.adapter') return {
        coreAuth: { getCurrentUser: async () => session.user },
        canCreateActivity: user => user?.coreRole === 'STUDENT' && user.isClassHead === true,
      };
      if (name === '@/lib/repositories/activity.repository') return { activityRepository: repository, ActivityError };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { session, calls, invalidated, ...exports };
}

function form(overrides = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    title: ' Workshop ',
    description: ' เรียนรู้ร่วมกัน ',
    category: 'workshop',
    location: ' CS201 ',
    maxParticipants: '30',
    startAt: '2026-10-10T09:00',
    endAt: '2026-10-10T12:00',
    ...overrides
  })) {
    data.set(key, value);
  }
  return data;
}

test('only a student class head may create, ignoring forged form permissions', async () => {
  const s = setup();
  for (const user of [null, { coreRole: 'STUDENT', isClassHead: false }, { coreRole: 'FACULTY', isClassHead: true }, { coreRole: 'STUDENT' }]) {
    s.session.user = user;
    assert.equal((await s.createActivityAction(form({ isClassHead: 'true' }))).success, false);
  }
  assert.equal(s.calls.length, 0);
});

test('creation uses server identity and converts Thai local schedule to UTC', async () => {
  const s = setup();
  assert.equal((await s.createActivityAction(form({ createdBy: 'attacker' }))).activityId, 'saved');
  const [user, saved] = s.calls[0].args;
  assert.equal(user.coreUserId, 'head');
  assert.equal(saved.title, 'Workshop');
  assert.equal(saved.startAt.toISOString(), '2026-10-10T02:00:00.000Z');
  assert.equal(saved.endAt.toISOString(), '2026-10-10T05:00:00.000Z');
  assert.ok(s.invalidated.includes('/my-activities'));
});

test('invalid create and edit inputs never reach the database', async () => {
  const s = setup();
  for (const input of [
    { title: ' ' },
    { title: new Blob(['file']) },
    { title: 'x'.repeat(151) },
    { description: 'x'.repeat(5001) },
    { category: 'invalid' },
    { location: 'x'.repeat(201) },
    ...['0', '-1', '1.5', 'Infinity', '2147483648'].map(maxParticipants => ({ maxParticipants }))
  ]) {
    assert.equal((await s.createActivityAction(form(input))).success, false);
    assert.equal((await s.updateActivityAction(form({ activityId: 'a', ...input }))).success, false);
  }
  for (const input of [{ startAt: '2026-02-30T09:00' }, { endAt: '2026-10-10T08:00' }, { endAt: '2026-10-10T09:00' }, { startAt: '' }]) {
    assert.equal((await s.createActivityAction(form(input))).success, false);
  }
  assert.equal(s.calls.length, 0);
});

test('all write actions reject anonymous requests', async () => {
  const s = setup();
  s.session.user = null;
  const results = await Promise.all([
    s.registerActivityAction('a'),
    s.cancelRegistrationAction('a'),
    s.applyTeamRoleAction('a', 'r'),
    s.respondTeamApplicationAction('a', 'app', 'ACCEPTED'),
    s.updateActivityStatusAction('a', 'OPEN'),
    s.createActivityRoleAction('a', form()),
    s.submitEvaluationAction(form()),
    s.updateActivityAction(form())
  ]);
  assert.ok(results.every(r => r.success === false));
  assert.equal(s.calls.length, 0);
});

test('invalid statuses and team role capacities are rejected', async () => {
  const s = setup();
  for (const status of ['DRAFT', 'invalid', null]) {
    assert.equal((await s.updateActivityStatusAction('a', status)).success, false);
  }
  assert.equal((await s.respondTeamApplicationAction('a', 'app', 'PENDING')).success, false);
  for (const input of [{ roleName: '' }, { roleName: 'x'.repeat(101) }, { roleDescription: 'x'.repeat(501) }, { maxMembers: '0' }, { maxMembers: '1.5' }, { maxMembers: '1000' }]) {
    assert.equal((await s.createActivityRoleAction('a', form({ roleName: 'Staff', maxMembers: '2', ...input }))).success, false);
  }
  assert.equal(s.calls.length, 0);
});

test('evaluation validates scores and text, and normalizes accepted feedback', async () => {
  const s = setup();
  const evaluation = overrides => form({ activityId: 'a', rating: '5', liked: ' ได้ฝึกจริง ', improvement: ' เพิ่มเวลา ', ...overrides });
  for (const rating of ['', '0', '6', '1.5', 'NaN', '1e0', new Blob(['file'])]) {
    assert.equal((await s.submitEvaluationAction(evaluation({ rating }))).success, false);
  }
  for (const key of ['liked', 'improvement']) {
    for (const value of [' ', 'x'.repeat(2001), new Blob(['file'])]) {
      assert.equal((await s.submitEvaluationAction(evaluation({ [key]: value }))).success, false);
    }
  }
  assert.equal(s.calls.length, 0);
  assert.equal((await s.submitEvaluationAction(evaluation({ userId: 'attacker' }))).success, true);
  assert.equal(s.calls[0].args[1].coreUserId, 'head');
  assert.equal(s.calls[0].args[2].liked, 'ได้ฝึกจริง');
});