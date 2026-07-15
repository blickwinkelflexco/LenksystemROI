import { handler, ok } from "@/lib/api";
import { clearSession } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return handler(async () => {
    clearSession();
    return ok();
  });
}
