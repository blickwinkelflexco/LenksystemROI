import { NextRequest } from "next/server";
import { handler, ok, fail, requireSession } from "@/lib/api";
import { runSync } from "@/lib/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Sync kann etwas dauern (Sheet lesen + DB schreiben).
export const maxDuration = 60;

/** Manueller Sync aus der App (erfordert Login). */
export async function POST() {
  return handler(async () => {
    await requireSession();
    const result = await runSync();
    return ok({ result });
  });
}

/**
 * Automatischer Sync per Vercel Cron.
 * Vercel schickt den Header "Authorization: Bearer <CRON_SECRET>".
 */
export async function GET(req: NextRequest) {
  return handler(async () => {
    const secret = process.env.CRON_SECRET;
    const auth = req.headers.get("authorization");
    if (secret && auth !== `Bearer ${secret}`) {
      return fail("Nicht autorisiert.", 401);
    }
    const result = await runSync();
    return ok({ result });
  });
}
