import { db } from "../src/lib/db";

async function main() {
  const [connection] = await db.$queryRaw<{ database: string; currentTime: Date }[]>`SELECT current_database() AS database, now() AS "currentTime"`;
  console.log({ ...connection, activities: await db.activity.count(), registrations: await db.registration.count(),
    roles: await db.activityRole.count(), applications: await db.teamApplication.count(), evaluations: await db.evaluation.count() });
}
main().catch(() => {
  console.error("Database check failed. Check Docker and DATABASE_URL locally; do not share the password.");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
