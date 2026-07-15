import { NextRequest } from "next/server";
import { handler, ok, requireSession } from "@/lib/api";
import { reserveCode } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return handler(async () => {
    const session = await requireSession();
    const body = await req.json().catch(() => ({}));
    const codeType = String(body.codeType || "").trim();
    if (!codeType) throw new Error("Code-Typ fehlt.");

    const reserved = await reserveCode(codeType, session.employee);
    return ok(reserved);
  });
}
