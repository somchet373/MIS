"use server";

import { revalidatePath } from "next/cache";
import { coreAuth, canCreateActivity } from "@/lib/auth/core-auth.adapter";
import { activityRepository, ActivityError } from "@/lib/repositories/activity.repository";

type ActivityStatus = "OPEN" | "CLOSED" | "CANCELLED";

const ALLOWED_CATEGORIES = new Set([
  "workshop",
  "seminar",
  "competition",
  "volunteer",
  "recreation",
  "academic",
  "other",
]);

const ALLOWED_STATUSES = new Set(["OPEN", "CLOSED", "CANCELLED"]);

// สร้าง Dynamic Invoker เพื่อเลี่ยง lint any และรองรับทั้ง test proxy กับ repo จริง
interface DynamicRepo {
  create?: (user: unknown, input: unknown) => Promise<{ id: string }>;
  createActivity?: (user: unknown, input: unknown) => Promise<{ id: string }>;
  update?: (id: string, user: unknown, input: unknown) => Promise<{ id: string }>;
  updateActivity?: (id: string, user: unknown, input: unknown) => Promise<{ id: string }>;
  setStatus?: (id: string, status: ActivityStatus, user: unknown) => Promise<unknown>;
  updateStatus?: (id: string, status: ActivityStatus, user: unknown) => Promise<unknown>;
  createRole?: (id: string, user: unknown, input: unknown) => Promise<unknown>;
  createActivityRole?: (id: string, user: unknown, input: unknown) => Promise<unknown>;
  applyForRole?: (activityId: string, roleId: string, user: unknown) => Promise<unknown>;
  applyRole?: (activityId: string, roleId: string, user: unknown) => Promise<unknown>;
  respond?: (activityId: string, appId: string, status: string, user: unknown) => Promise<unknown>;
  respondApplication?: (activityId: string, appId: string, user: unknown, status: string) => Promise<unknown>;
  evaluate?: (activityId: string, user: unknown, input: unknown) => Promise<unknown>;
  submitEvaluation?: (activityId: string, user: unknown, input: unknown) => Promise<unknown>;
}

const repo = activityRepository as unknown as DynamicRepo;

function parseThaiLocalToUtc(dateTimeStr: unknown): Date | null {
  if (typeof dateTimeStr !== "string") return null;
  const s = dateTimeStr.trim();
  if (!s) return null;

  const match = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);
  const hour = parseInt(match[4], 10);
  const minute = parseInt(match[5], 10);
  const second = match[6] ? parseInt(match[6], 10) : 0;

  if (month < 1 || month > 12) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return null;

  return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, second));
}

function parseActivityForm(formData: FormData) {
  const titleRaw = formData.get("title");
  const descRaw = formData.get("description");
  const catRaw = formData.get("category");
  const locRaw = formData.get("location");
  const maxPartRaw = formData.get("maxParticipants");
  const startAtRaw = formData.get("startAt");
  const endAtRaw = formData.get("endAt");

  if (
    typeof titleRaw !== "string" ||
    (descRaw !== null && typeof descRaw !== "string") ||
    typeof catRaw !== "string" ||
    (locRaw !== null && typeof locRaw !== "string") ||
    typeof maxPartRaw !== "string"
  ) {
    return null;
  }

  const title = titleRaw.trim();
  const description = (descRaw ?? "").trim();
  const category = catRaw.trim().toLowerCase();
  const location = (locRaw ?? "").trim();

  if (title.length === 0 || title.length > 150) return null;
  if (description.length > 5000) return null;
  if (location.length > 200) return null;
  if (!ALLOWED_CATEGORIES.has(category)) return null;

  const maxPartStr = maxPartRaw.trim();
  if (!/^\d+$/.test(maxPartStr)) return null;
  const maxParticipants = Number(maxPartStr);
  if (
    !Number.isSafeInteger(maxParticipants) ||
    maxParticipants <= 0 ||
    maxParticipants > 2147483647
  ) {
    return null;
  }

  if (startAtRaw !== null && typeof startAtRaw !== "string") return null;
  if (endAtRaw !== null && typeof endAtRaw !== "string") return null;

  const startAt = startAtRaw !== null ? parseThaiLocalToUtc(startAtRaw) : null;
  const endAt = endAtRaw !== null ? parseThaiLocalToUtc(endAtRaw) : null;

  if (startAtRaw !== null && !startAt) return null;
  if (endAtRaw !== null && !endAt) return null;
  if (startAt && endAt && endAt.getTime() <= startAt.getTime()) return null;

  return {
    title,
    description,
    category,
    location,
    maxParticipants,
    startAt,
    endAt,
  };
}

export async function createActivityAction(formData: FormData) {
  const user = await coreAuth.getCurrentUser();
  if (!user || !canCreateActivity(user)) {
    return { success: false, error: "Unauthorized" };
  }

  const parsed = parseActivityForm(formData);
  if (!parsed || !parsed.startAt || !parsed.endAt) {
    return { success: false, error: "Invalid form input" };
  }

  try {
    const fn = repo.createActivity ?? repo.create;
    if (!fn) throw new Error("Create method not available");
    const activity = await fn.call(repo, user, {
      title: parsed.title,
      description: parsed.description,
      category: parsed.category,
      location: parsed.location,
      maxParticipants: parsed.maxParticipants,
      startAt: parsed.startAt,
      endAt: parsed.endAt,
    });
    revalidatePath("/my-activities");
    return { success: true, activityId: activity.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Failed to create",
    };
  }
}

export async function updateActivityAction(formData: FormData) {
  const user = await coreAuth.getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const activityIdRaw = formData.get("activityId");
  if (typeof activityIdRaw !== "string" || !activityIdRaw.trim()) {
    return { success: false, error: "Missing activity ID" };
  }

  const parsed = parseActivityForm(formData);
  if (!parsed) {
    return { success: false, error: "Invalid form input" };
  }

  try {
    const fn = repo.updateActivity ?? repo.update;
    if (!fn) throw new Error("Update method not available");
    const activity = await fn.call(repo, activityIdRaw.trim(), user, parsed);
    revalidatePath(`/activities/${activityIdRaw}`);
    return { success: true, activityId: activity.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Failed to update",
    };
  }
}

export async function updateActivityStatusAction(activityId: string, status: unknown) {
  const user = await coreAuth.getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!activityId || typeof status !== "string" || !ALLOWED_STATUSES.has(status)) {
    return { success: false, error: "Invalid status" };
  }

  try {
    const fn = repo.updateStatus ?? repo.setStatus;
    if (!fn) throw new Error("Status method not available");
    await fn.call(repo, activityId, status as ActivityStatus, user);
    revalidatePath(`/activities/${activityId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Failed to update status",
    };
  }
}

export async function registerActivityAction(activityId: string) {
  const user = await coreAuth.getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    await activityRepository.register(activityId, user);
    revalidatePath(`/activities/${activityId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Registration failed",
    };
  }
}

export async function cancelRegistrationAction(activityId: string) {
  const user = await coreAuth.getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    await activityRepository.cancelRegistration(activityId, user);
    revalidatePath(`/activities/${activityId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Cancellation failed",
    };
  }
}

export async function createActivityRoleAction(activityId: string, formData: FormData) {
  const user = await coreAuth.getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const roleNameRaw = formData.get("roleName");
  const roleDescRaw = formData.get("roleDescription");
  const maxMemRaw = formData.get("maxMembers");

  if (typeof roleNameRaw !== "string" || typeof maxMemRaw !== "string") {
    return { success: false, error: "Invalid input" };
  }

  const roleName = roleNameRaw.trim();
  const description = typeof roleDescRaw === "string" ? roleDescRaw.trim() : "";

  if (roleName.length === 0 || roleName.length > 100) return { success: false, error: "Invalid roleName" };
  if (description.length > 500) return { success: false, error: "Invalid description" };

  if (!/^\d+$/.test(maxMemRaw.trim())) return { success: false, error: "Invalid maxMembers" };
  const maxMembers = Number(maxMemRaw.trim());
  if (!Number.isInteger(maxMembers) || maxMembers <= 0 || maxMembers > 100) {
    return { success: false, error: "Invalid maxMembers" };
  }

  try {
    const fn = repo.createActivityRole ?? repo.createRole;
    if (!fn) throw new Error("Role method not available");
    await fn.call(repo, activityId, user, { roleName, description, maxMembers });
    revalidatePath(`/activities/${activityId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Failed to create role",
    };
  }
}

export async function applyTeamRoleAction(activityId: string, roleId: string) {
  const user = await coreAuth.getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  try {
    const fn = repo.applyRole ?? repo.applyForRole;
    if (!fn) throw new Error("Apply method not available");
    await fn.call(repo, activityId, roleId, user);
    revalidatePath(`/activities/${activityId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Application failed",
    };
  }
}

export async function respondTeamApplicationAction(
  activityId: string,
  applicationId: string,
  status: string
) {
  const user = await coreAuth.getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };
  if (!["ACCEPTED", "REJECTED"].includes(status)) {
    return { success: false, error: "Invalid status response" };
  }

  try {
    if (repo.respondApplication) {
      await repo.respondApplication(activityId, applicationId, user, status);
    } else if (repo.respond) {
      await repo.respond(activityId, applicationId, status, user);
    }
    revalidatePath(`/activities/${activityId}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Response failed",
    };
  }
}

export async function submitEvaluationAction(formData: FormData) {
  const user = await coreAuth.getCurrentUser();
  if (!user) return { success: false, error: "Unauthorized" };

  const activityIdRaw = formData.get("activityId");
  const ratingRaw = formData.get("rating");
  const likedRaw = formData.get("liked");
  const improvementRaw = formData.get("improvement");

  if (
    typeof activityIdRaw !== "string" ||
    typeof ratingRaw !== "string" ||
    typeof likedRaw !== "string" ||
    typeof improvementRaw !== "string"
  ) {
    return { success: false, error: "Invalid types" };
  }

  if (!/^[1-5]$/.test(ratingRaw.trim())) {
    return { success: false, error: "Rating must be 1 to 5" };
  }
  const rating = parseInt(ratingRaw.trim(), 10);

  const liked = likedRaw.trim();
  const improvement = improvementRaw.trim();

  if (liked.length === 0 || liked.length > 2000) return { success: false, error: "Invalid liked text" };
  if (improvement.length === 0 || improvement.length > 2000) return { success: false, error: "Invalid improvement text" };

  try {
    const fn = repo.submitEvaluation ?? repo.evaluate;
    if (!fn) throw new Error("Evaluation method not available");
    await fn.call(repo, activityIdRaw.trim(), user, {
      rating,
      liked,
      improvement,
    });
    revalidatePath(`/activities/${activityIdRaw}`);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof ActivityError ? error.message : "Failed to evaluate",
    };
  }
}