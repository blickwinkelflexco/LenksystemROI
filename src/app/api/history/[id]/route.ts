import { NextRequest } from "next/server";
import { handler, ok, requireSession } from "@/lib/api";
import { updateHistoryCustomer, reactivateHistory } from "@/lib/codes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  return handler(async () => {
    await requireSession();
    const id = Number(params.id);
    if (!id) throw new Error("Ungültige ID.");
    const body = await req.json().catch(() => ({}));

    if (body.action === "reactivate") {
      await reactivateHistory(id);
      return ok();
    }
    if (typeof body.customer === "string") {
      await updateHistoryCustomer(id, body.customer);
      return ok();
    }
    throw new Error("Keine gültige Änderung angegeben.");
  });
}
