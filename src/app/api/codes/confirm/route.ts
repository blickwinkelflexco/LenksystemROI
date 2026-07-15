import { NextRequest } from "next/server";
import { handler, ok, requireSession } from "@/lib/api";
import { confirmCode } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handler(async () => {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));
    const id = Number(body.id);
    const customer = String(body.customer || "").trim();
    if (!id) throw new Error("Code-ID fehlt.");

    await confirmCode(id, session.employee, customer);
    return ok();
  });
}
