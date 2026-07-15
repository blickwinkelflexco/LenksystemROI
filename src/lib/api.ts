import { NextResponse } from "next/server";
import { getSession, Session } from "./session";
import { AppError } from "./codes";

export function ok(data: any = { ok: true }) {
  return NextResponse.json(data);
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Wrappt einen Handler mit einheitlicher Fehlerbehandlung. */
export function handler(fn: () => Promise<NextResponse>) {
  return fn().catch((err: any) => {
    const status = err instanceof AppError ? err.status : 500;
    if (status >= 500) console.error(err);
    return fail(err?.message || "Interner Fehler", status);
  });
}

/** Verlangt eine gültige Session, sonst 401. */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AppError("Nicht angemeldet.", 401);
  return session;
}
