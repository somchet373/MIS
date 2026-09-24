import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForDb = globalThis as unknown as { activityDb?: PrismaClient };

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

export const db = globalForDb.activityDb ?? createClient();
if (process.env.NODE_ENV !== "production") globalForDb.activityDb = db;
