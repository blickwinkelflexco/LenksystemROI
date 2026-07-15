import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";

const COOKIE_NAME = "lsroi_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 Tage

function secret(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "SESSION_SECRET fehlt oder ist zu kurz (min. 16 Zeichen). Bitte in den Env-Variablen setzen.",
    );
  }
  return new TextEncoder().encode(s);
}

export interface Session {
  employee: string;
}

export async function createSession(employee: string): Promise<void> {
  const token = await new SignJWT({ employee })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function getSession(): Promise<Session | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (typeof payload.employee === "string" && payload.employee) {
      return { employee: payload.employee };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  cookies().set(COOKIE_NAME, "", { path: "/", maxAge: 0 });
}

/** Konstantzeit-Vergleich, um Timing-Angriffe auf das Passwort zu vermeiden. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
