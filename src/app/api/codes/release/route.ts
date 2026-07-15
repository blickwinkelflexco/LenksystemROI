import { NextRequest } from "next/server";
import { handler, ok, requireSession } from "@/lib/api";
import { releaseCode } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handler(async () => {
    await requireSession();
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    if (!id) throw new Error("Code-ID fehlt.");
    await releaseCode(id);
    return ok();
  });
}
