import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { completeTransfer, getTransfer } from "@/server/transfers";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "complete-transfer", 60);
    const { id } = await params;
    const transfer = await getTransfer(id);
    if (!transfer) return noStoreJson({ error: "Transfer not found" }, { status: 404 });
    await completeTransfer(transfer);
    return noStoreJson({ completed: true });
  } catch (error) {
    return jsonError(error);
  }
}
