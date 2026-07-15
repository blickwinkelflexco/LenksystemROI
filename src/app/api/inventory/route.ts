import { handler, ok, requireSession } from "@/lib/api";
import { getInventory } from "@/lib/codes";
import { getLastSync } from "@/lib/sync";
import { LOW_STOCK_THRESHOLD } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handler(async () => {
    await requireSession();
    const [inventory, sync] = await Promise.all([getInventory(), getLastSync()]);
    return ok({ inventory, sync, lowStockThreshold: LOW_STOCK_THRESHOLD });
  });
}
