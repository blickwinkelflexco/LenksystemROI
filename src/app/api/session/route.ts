import { handler, ok } from "@/lib/api";
import { getSession } from "@/lib/session";
import { EMPLOYEES } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handler(async () => {
    const session = await getSession();
    return ok({ employee: session?.employee ?? null, employees: EMPLOYEES });
  });
}
