import { NextRequest } from "next/server";
import { handler, ok, fail } from "@/lib/api";
import { createSession, safeEqual } from "@/lib/session";
import { EMPLOYEES } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handler(async () => {
    const body = await req.json().catch(() => ({}));
    const password = String(body.password || "");
    const employee = String(body.employee || "").trim();

    const expected = process.env.APP_PASSWORD;
    if (!expected) return fail("APP_PASSWORD ist nicht konfiguriert.", 500);

    if (!safeEqual(password, expected)) {
      return fail("Falsches Passwort.", 401);
    }
    if (!EMPLOYEES.includes(employee)) {
      return fail("Bitte einen gültigen Mitarbeiter auswählen.", 400);
    }

    await createSession(employee);
    return ok({ employee });
  });
}
