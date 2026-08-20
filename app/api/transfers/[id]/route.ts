import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { deleteTransfer, getTransfer, publicTransfer } from "@/server/transfers";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const transfer = await getTransfer(id);
    if (!transfer || transfer.status !== "ready" || transfer.expires_at <= Date.now()) {
      return noStoreJson({ error: "Transfer not found" }, { status: 404 });
    }
    return noStoreJson({ transfer: publicTransfer(transfer) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "delete-transfer", 60);
    const { id } = await params;
    const transfer = await getTransfer(id);
    if (!transfer) return noStoreJson({ deleted: true });
    const authorization = request.headers.get("authorization") ?? "";
    const deleteToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    await deleteTransfer(transfer, deleteToken);
    return noStoreJson({ deleted: true });
  } catch (error) {
    return jsonError(error);
  }
}
