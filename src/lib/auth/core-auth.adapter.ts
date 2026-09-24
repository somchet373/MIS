export interface CoreUserSession {
  coreUserId: string;
  displayName: string;
  coreRole: "STUDENT" | "FACULTY";
  isClassHead: boolean;
}

export interface CoreIdentityProvider {
  getCurrentUser(): Promise<CoreUserSession | null>;
}

// Local development identity only. Replace with the verified Core session contract.
// LOCAL_TEST_ROLE is server configuration, never a form/cookie supplied by a user.
export class LocalTestIdentityProvider implements CoreIdentityProvider {
  async getCurrentUser(): Promise<CoreUserSession | null> {
    if (process.env.NODE_ENV === "production") return null;
    const role = process.env.LOCAL_TEST_ROLE ?? "HEAD";
    if (role !== "HEAD" && role !== "STUDENT") return null;
    return {
      coreUserId: role === "HEAD" ? "local-head-001" : "local-student-001",
      displayName: role === "HEAD" ? "หัวหน้าห้อง (ผู้ใช้ทดสอบ)" : "นักศึกษา (ผู้ใช้ทดสอบ)",
      coreRole: "STUDENT",
      isClassHead: role === "HEAD",
    };
  }
}

export function canCreateActivity(user: CoreUserSession | null): boolean {
  return user?.coreRole === "STUDENT" && user.isClassHead === true;
}

export const coreAuth = new LocalTestIdentityProvider();
