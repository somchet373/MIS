# CSMJU2030 — Activity Planning & Improvement System

## Current override (2026-09-24)

- User authorized local PostgreSQL now, superseding the previous instruction to wait for PM before creating a schema.
- Only student class heads can create activities. Check the server-derived `isClassHead` flag and STUDENT identity in both the create page and action; creation links follow the same predicate.
- Core is not available. User explicitly approved retaining temporary local test identity while removing mock activity storage.
- Local PostgreSQL `csmju2030` at `127.0.0.1:5432` now has an applied Prisma migration for five activity tables. No demo seed was imported.
- All activity pages and actions use `PostgresActivityRepository`. Mutations serialize per activity using PostgreSQL row locks; participant/team counts derive from records.
- Prisma 8 release-candidate CLI replaced by aligned Prisma ORM/Client/adapter-pg 7.10.0. Next dev/build remain on Webpack due to the machine's native SWC policy.
- Local identity defaults to HEAD; `LOCAL_TEST_ROLE=STUDENT` selects a regular student. Disabled entirely in production. This is not real authentication or a verified Core contract.
- Setup, tables, testing, and identity switching: `docs/local-postgresql.md`.
- Verified: 6 Server Action boundary tests, 9 real PostgreSQL integration tests, lint, TypeScript and production Webpack build passed. Build needed network access for the existing Google Fonts imports.
- Browser verified HEAD creation/team role creation, persistence after a server restart, STUDENT creation-page denial, registration, team application, My Activities and cancellation. Exact browser test record and automated test records were removed afterwards; database starts empty.
- Earlier sections below are historical; their mock-store architecture and older test counts are superseded.

## Agreed requirements (2026-09-08)

- Subsystem of CSMJU2030 MIS, Computer Science, Faculty of Science, Maejo University.
- Student-driven workflow: Create Activity → Find Team → Recruit Participants → Manage → Evaluate → Improvement History.
- Contextual organizer/student/team roles per activity; do not add permanent roles to Core.
- Next.js App Router, TypeScript, Server Actions, Tailwind CSS v4; modular monolith targeting PostgreSQL and Prisma.
- Core identity via `core-auth.adapter.ts`; no independent login/register system.
- Tokens: primary #004C99, secondary #E6F2FF, neutral #334155, tertiary #F8FAFC. Thai-first, minimum 14px, line-height at least 1.6, no negative letter-spacing.
- Out of scope: QR check-in, certificates, payment/budgets, room/equipment booking, chat, AI features.
- Teach in Thai step by step: explain purpose, affected parts, and expected result first. Provide only necessary code. Ask for confirmation after each step before starting the next.

## Step 1: My Registrations

- Added per-user registrations to the existing mock store, server-side duplicate/status/capacity checks, and cancellation using the identity adapter's current user.
- `/my-activities` lists the current user's registrations; detail page shows registered state. Form reports action errors and disables pending submissions.
- Working rule: cancellation is allowed only while activity status is OPEN or FULL; a freed seat reopens FULL if below capacity. This is status-based, not a date cutoff.
- Old mock participant counts have no associated user records. No identities have been invented for those counts; the new list covers registrations created after this change.
- Mock storage is temporary, process-local, and not safe as production persistence. Database migration must provide uniqueness and transactional capacity handling.

## Team coordination and current scope

- The larger project has PM, PL and multiple AEs. The user is the AE for this activity subsystem.
- Database design/integration must wait for PM. Continue building the website with mock data; do not independently create schema or migrations.
- Future Core integration must use the team's verified contract.

## Step 2: Organizer authorization and evaluation validation

- Status updates and team decisions authenticate via the Core adapter and check activity ownership server-side. Manage and summary pages redirect non-owners to the activity detail page.
- Team decisions require an application and role belonging to the same activity, PENDING status, and available role capacity. Decisions and team applications are allowed only in OPEN/FULL. Replayed decisions cannot overwrite the first result.
- Status input is validated at runtime against the existing UI options. OPEN becomes FULL when capacity is reached; manual FULL is rejected while seats remain. A stricter lifecycle transition policy is still a team decision.
- Evaluation requires COMPLETED and an existing registration for the current user in that activity. Organizer/team membership alone does not confer evaluation rights. This is a provisional rule for review with PM/PL, not a confirmed Core contract.
- Scores must be integers 1–5; both feedback fields require 1–2000 trimmed characters. One evaluation per user/activity is enforced in the mock process.
- Shared ActionForm displays success/error feedback and pending state for organizer and evaluation forms. EvaluationForm's previous TypeScript error is fixed.

## Suggested next step, requiring confirmation

- Separate mock data access behind a small service/repository interface so the AE can continue UI work while awaiting the PM's database contract.

## Observed gaps in existing code

- User-reported progress was approximately 75%; this percentage has not been independently verified.
- No `prisma/schema.prisma` was found in the project during inspection.
- Some existing UI uses text smaller than 14px; the newly added registration UI uses at least 14px and line-height 1.6.

## Verification

- Registration regression tests: `node --test tests/registration.test.mjs` (PowerShell); all 16 registration, authorization, team quota and evaluation cases pass.
- HTTP smoke checks: my activities, demo detail, organizer manage and summary all return 200 for the mock organizer. Full interactive browser flow has not been tested.
- Full project checks (both pass): `npm run lint` and `npx tsc --noEmit` (PowerShell).
- Manual flow: create an OPEN activity, register, view `/my-activities`, cancel, check the freed seat, and register again.

## Step 3: UI refresh while awaiting PM database

- Shared navigation with current-page indicator, Thai page metadata, skip link and keyboard focus styling.
- Redesigned My Activities with three role counters, section shortcuts, clear empty states, Thai status labels and activity dates.
- Home catalog has client-side text search, status filter, result count and reset action; no additional dependencies or mock records added.
- Responsive card layout and minimum 14px typography across existing TSX components. Shared buttons have a minimum 44px height.
- Verified search no-results, reset and status filtering through the browser; visually inspected My Activities at normal and 390px viewport sizes. Viewport override reset afterwards.
- Lint, TypeScript and the existing 16 action tests pass. This is a UI refresh, not a full production or accessibility audit.

## Step 4: Create Activity form (2026-09-10)

- Redesigned creation into three sections: basic information, Thai-local schedule/location, and participant capacity, with a responsive guide and clear immediate-publication notice.
- Replaced hardcoded dates with submitted startAt/endAt. Server validates category, text lengths, positive integer capacity, real calendar dates and end time after start time; organizer identity comes from the Core adapter.
- Form shows date errors, character counts, pending state and a success panel linking to management/details.
- Lint and TypeScript pass; action tests now total 18 passing cases.
- Browser verified invalid date ordering disables submit, then created a labeled mock test activity and verified its detail page displays 10 October 2026, 12:00–15:00 and 30 seats as submitted.
- One temporary mock record titled [ทดสอบ] ฟอร์มสร้างกิจกรรม remains for inspection; it is process-local. Database still awaits PM.

## PostgreSQL connection check (2026-09-21)

- Team-provided containers `postgres-db` and `pgadmin` are running. PostgreSQL is published to Windows at `127.0.0.1:5432`.
- Project `.env` is now at the repository root beside `package.json`, is ignored by Git, and contains a valid PostgreSQL URL for database `csmju2030` using user `postgres`. Password was not exposed.
- `pg_isready` reports the server is accepting connections. Read-only SQL confirmed database `csmju2030` and user `postgres`.
- The application database currently has no non-system tables. No Prisma schema or migration was created because the PM/team contract is still pending.

## Step 5: Repository boundary draft (2026-09-21)

- Added `src/lib/repositories/activity.repository.ts` with an `ActivityRepository` contract and `MockActivityRepository` adapter.
- The contract currently exposes read operations for activities, registrations, team applications, and evaluations. It deliberately keeps synchronous signatures matching the current process-local mock; the Prisma version will be designed after the team's schema and transaction requirements are known.
- No page or Server Action was switched yet. This keeps behavior unchanged while establishing the seam for a controlled migration in the next step.
- Lint, TypeScript, and all 18 existing action tests still pass.

## Step 6: Team role creation (2026-09-21)

- Added `createActivityRoleAction` and a form on the organizer manage page for role name, description, and capacity.
- Server checks organizer ownership, activity status, length limits, positive capacity, and duplicate role names. New roles immediately appear in the activity detail page for applications.
- Lint and TypeScript pass; action tests now total 20 passing cases.
