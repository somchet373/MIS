-- CreateSchema
BEGIN;
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('DRAFT', 'OPEN', 'FULL', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "activity_activities" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "startAt" TIMESTAMPTZ(3) NOT NULL,
    "endAt" TIMESTAMPTZ(3) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "maxParticipants" INTEGER NOT NULL,
    "status" "ActivityStatus" NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT NOT NULL,
    "creatorName" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_roles" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "roleName" VARCHAR(100) NOT NULL,
    "nameKey" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500) NOT NULL DEFAULT '',
    "maxMembers" INTEGER NOT NULL,

    CONSTRAINT "activity_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_team_applications" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_team_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_registrations" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_registrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_evaluations" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "liked" VARCHAR(2000) NOT NULL,
    "improvement" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "activity_activities_createdBy_idx" ON "activity_activities"("createdBy");

-- CreateIndex
CREATE INDEX "activity_activities_status_startAt_idx" ON "activity_activities"("status", "startAt");

-- CreateIndex
CREATE UNIQUE INDEX "activity_roles_activityId_nameKey_key" ON "activity_roles"("activityId", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "activity_roles_id_activityId_key" ON "activity_roles"("id", "activityId");

-- CreateIndex
CREATE INDEX "activity_team_applications_roleId_activityId_status_idx" ON "activity_team_applications"("roleId", "activityId", "status");

-- CreateIndex
CREATE INDEX "activity_team_applications_userId_idx" ON "activity_team_applications"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_team_applications_activityId_userId_key" ON "activity_team_applications"("activityId", "userId");

-- CreateIndex
CREATE INDEX "activity_registrations_userId_idx" ON "activity_registrations"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_registrations_activityId_userId_key" ON "activity_registrations"("activityId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "activity_evaluations_activityId_userId_key" ON "activity_evaluations"("activityId", "userId");

-- AddForeignKey
ALTER TABLE "activity_roles" ADD CONSTRAINT "activity_roles_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_team_applications" ADD CONSTRAINT "activity_team_applications_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_team_applications" ADD CONSTRAINT "activity_team_applications_roleId_activityId_fkey" FOREIGN KEY ("roleId", "activityId") REFERENCES "activity_roles"("id", "activityId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_registrations" ADD CONSTRAINT "activity_registrations_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_evaluations" ADD CONSTRAINT "activity_evaluations_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "activity_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "activity_activities" ADD CONSTRAINT "activity_capacity_positive" CHECK ("maxParticipants" > 0);
ALTER TABLE "activity_activities" ADD CONSTRAINT "activity_dates_ordered" CHECK ("endAt" > "startAt");
ALTER TABLE "activity_roles" ADD CONSTRAINT "activity_role_capacity_valid" CHECK ("maxMembers" BETWEEN 1 AND 999);
ALTER TABLE "activity_evaluations" ADD CONSTRAINT "activity_rating_valid" CHECK ("rating" BETWEEN 1 AND 5);
COMMIT;
