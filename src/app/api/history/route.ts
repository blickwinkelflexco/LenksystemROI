import { handler, ok, requireSession } from "@/lib/api";
import { getHistory } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handler(async () => {
    await requireSession();
    const entries = await getHistory();
    return ok({ history: entries });
  });
}
