"use server";

import { supabaseAdmin } from "@/lib/supabase-admin";
import DOMPurify from "isomorphic-dompurify";
import { revalidatePath } from "next/cache";
import { headers, cookies } from "next/headers";
import crypto from "crypto";

const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const rateLimitMap = new Map<string, { attempts: number; lockoutUntil: number }>();
let lastCleanupAt = 0;

function maybeCleanupRateLimitMap(): void {
  const now = Date.now();
  if (now - lastCleanupAt < CLEANUP_INTERVAL_MS) return;
  lastCleanupAt = now;
  for (const [key, record] of rateLimitMap.entries()) {
    if (record.lockoutUntil < now && record.attempts === 0) {
      rateLimitMap.delete(key);
    }
  }
}

async function getClientId(): Promise<string> {
  const headersList = await headers();
  const ipHeader = headersList.get("x-forwarded-for") || headersList.get("x-real-ip") || "";
  if (ipHeader) return ipHeader.split(",")[0].trim();

  const cookieStore = await cookies();
  const existing = cookieStore.get("rate_limit_session")?.value;
  if (existing) return existing;

  const fresh = crypto.randomBytes(16).toString("hex");
  try {
    cookieStore.set("rate_limit_session", fresh, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24,
    });
  } catch { }
  return fresh;
}

function checkRateLimit(clientId: string): string | null {
  maybeCleanupRateLimitMap();
  const record = rateLimitMap.get(clientId);
  if (!record) return null;
  if (Date.now() < record.lockoutUntil) {
    const minutesLeft = Math.ceil((record.lockoutUntil - Date.now()) / 60_000);
    return `Too many attempts. Please try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`;
  }
  return null;
}

function recordFailedAttempt(clientId: string): string {
  const record = rateLimitMap.get(clientId) ?? { attempts: 0, lockoutUntil: 0 };
  record.attempts += 1;

  if (record.attempts >= MAX_ATTEMPTS) {
    record.lockoutUntil = Date.now() + LOCKOUT_DURATION_MS;
    record.attempts = 0;
    rateLimitMap.set(clientId, record);
    return "Account locked for 15 minutes due to too many failed attempts.";
  }

  rateLimitMap.set(clientId, record);
  const attemptsLeft = MAX_ATTEMPTS - record.attempts;
  return `Invalid PIN. ${attemptsLeft} attempt${attemptsLeft === 1 ? "" : "s"} remaining.`;
}

function resetRateLimit(clientId: string): void {
  rateLimitMap.delete(clientId);
}

function timingSafeCompare(a: string, b: string): boolean {
  const PAD = 128;
  const bufA = Buffer.from(a.padEnd(PAD, "\0").slice(0, PAD));
  const bufB = Buffer.from(b.padEnd(PAD, "\0").slice(0, PAD));
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------------------
// 1. VOID ACTION: Uses void_pin from restaurant_settings
// ---------------------------------------------------------------------------
async function fetchVoidPin(): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("restaurant_settings")
    .select("void_pin")
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data || !data.void_pin) return null;
  return String(data.void_pin);
}

export type VoidResponse = {
  success: boolean;
  error?: string;
};

export async function verifyManagerPinAndVoid(
  targetId: string,
  pin: string,
  rawReason: string
): Promise<VoidResponse> {
  try {
    if (!targetId || typeof targetId !== "string") return { success: false, error: "Invalid target ID." };
    if (!pin || typeof pin !== "string") return { success: false, error: "PIN is required." };
    if (!rawReason || typeof rawReason !== "string") return { success: false, error: "Void reason is required." };

    const clientId = await getClientId();
    const lockoutError = checkRateLimit(clientId);
    if (lockoutError) return { success: false, error: lockoutError };

    const validPin = await fetchVoidPin();
    if (validPin === null) return { success: false, error: "System configuration error: Void PIN not set." };

    if (!timingSafeCompare(pin, validPin)) {
      return { success: false, error: recordFailedAttempt(clientId) };
    }

    resetRateLimit(clientId);

    const sanitizedReason = DOMPurify.sanitize(rawReason);
    if (!sanitizedReason.trim()) return { success: false, error: "A valid void reason is required." };

    const { error: dbError } = await supabaseAdmin
      .from("petty_cash_logs")
      .update({
        is_voided: true,
        void_reason: sanitizedReason,
        voided_by: "Manager",
        voided_at: new Date().toISOString(),
      })
      .eq("id", targetId);

    if (dbError) return { success: false, error: "Failed to update database." };

    revalidatePath("/analytics");
    revalidatePath("/cashier");

    return { success: true };
  } catch (error) {
    return { success: false, error: "An unexpected server error occurred." };
  }
}

// ---------------------------------------------------------------------------
// 2. STAFF LOGIN: Uses username and pin from staff table
// ---------------------------------------------------------------------------
export type LoginResponse = {
  success: boolean;
  username?: string;
  role?: string;
  error?: string;
};

export async function verifyStaffLogin(
  username: string,
  pin: string
): Promise<LoginResponse> {
  try {
    if (!username || typeof username !== "string") {
      return { success: false, error: "Username is required." };
    }
    if (!pin || typeof pin !== "string") {
      return { success: false, error: "Password is required." };
    }

    const clientId = await getClientId();
    const lockoutError = checkRateLimit(clientId);
    if (lockoutError) return { success: false, error: "Too many failed attempts. Try again later." };

    // Query the staff table directly
    const { data: staffMember, error: dbError } = await supabaseAdmin
      .from("staff")
      .select("*")
      .eq("username", username.trim())
      .eq("is_active", true)
      .maybeSingle();

    if (dbError || !staffMember) {
      recordFailedAttempt(clientId);
      return { success: false, error: "Invalid username or password." };
    }

    // Verify PIN with constant-time equality
    const pinOk = timingSafeCompare(pin, String(staffMember.pin));

    if (!pinOk) {
      const failMsg = recordFailedAttempt(clientId);
      const userMsg = failMsg.startsWith("Invalid PIN") ? "Invalid username or password." : failMsg;
      return { success: false, error: userMsg };
    }

    resetRateLimit(clientId);

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const cookieStore = await cookies();
    cookieStore.set("auth_token", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
    });

    return {
      success: true,
      username: staffMember.name || staffMember.username,
      role: staffMember.role || "Staff",
    };
  } catch (error) {
    console.error("Login Action Error:", error);
    return { success: false, error: "An unexpected server error occurred." };
  }
}

export async function clearStaffLogin(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete("auth_token");
}