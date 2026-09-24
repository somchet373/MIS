# Local PostgreSQL development

The activity subsystem now uses PostgreSQL through Prisma 7.10.0. The previous
in-memory activity store and demo records have been removed. No automatic seed runs.
This schema is a local subsystem design, not a confirmed CSMJU2030 Core/PM contract.
Configuration follows the [Prisma 7 setup documentation](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).

## Start

1. Start the team-provided `postgres-db` container in Docker Desktop.
2. Keep `DATABASE_URL` in the ignored root `.env`. For the Windows app, use
   `127.0.0.1:5432` and database `csmju2030`. Keep the existing password private.
   pgAdmin runs in Docker and uses `postgres-db` as its host instead.
3. After a fresh checkout: `npm ci`, `npm run db:generate`, `npm run db:migrate`.
4. Check the connection with `npm run db:check`, then start `npm run dev`.

`db:migrate` applies checked-in migrations. It does not reset the database.
Do not use `prisma migrate reset` on data you need to keep.
The old `compose.yaml` describes a different database on port 5433; it is not
the team-provided container used by this application.

## Temporary identity while waiting for Core

Only identity is simulated; activities and related records are persisted in PostgreSQL.
The default development identity is `local-head-001`, a student class head.
To test a regular student, stop the server and add this to the root `.env`:

```dotenv
LOCAL_TEST_ROLE=STUDENT
```

Restart `npm run dev` and reload the browser. The identity becomes
`local-student-001`. Creation links disappear, the create page refuses access,
and the create action also rejects the request. This student can register and
apply for a team role. Use `LOCAL_TEST_ROLE=HEAD` to return to the class head.
Unknown values disable the test session. Test identity is always disabled when
`NODE_ENV=production`; production needs a real Core provider.
There is no independent login, register, password store, or client-side role switch.

Head permission only controls creating new activities. Existing organizer permissions
continue to depend on the activity's `createdBy` identifier.

## Stored data

- `activity_activities`: activity details, schedule, status, Core creator ID/name snapshot.
- `activity_roles`: team positions and capacities.
- `activity_team_applications`: one application per activity and user.
- `activity_registrations`: one registration per activity and user.
- `activity_evaluations`: one evaluation per activity and user.

The `_prisma_migrations` table records applied migrations. Refresh pgAdmin's
`csmju2030 > Schemas > public > Tables` to see them.
Counts come from registration/application rows, rather than separately stored counters.
All application mutations for an existing activity lock its row in a transaction,
so concurrent registration, cancellation, capacity edits, status changes and team
decisions cannot use stale quota checks. SQL constraints also protect uniqueness,
foreign keys, positive capacities, date order and ratings of 1–5.
Date/time inputs use Thailand time (+07:00); PostgreSQL stores timestamptz and the
UI displays Asia/Bangkok time.

## Verification

- `npm test`: Server Action validation, identity and head permission checks.
- `npm run test:db`: real PostgreSQL concurrency, ownership and persistence tests.
  Only runs against a localhost database; creates unique temporary rows and removes
  only rows created by that run. An interrupted run may leave clearly marked test rows.
- `npx tsc --noEmit` and `npm run lint`.

When PM supplies the actual contract, update the identity adapter and repository
mapping, and add a migration if necessary. Existing local records still need an
explicit migration/mapping plan; compatibility with an unknown Core schema is not assumed.
