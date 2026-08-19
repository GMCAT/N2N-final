import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { getTransfer, MAX_PART_BYTES, storeCiphertextPart } from "@/server/transfers";

type Context = { params: Promise<{ id: string; index: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "part-upload", 600);
    const { id, index: encodedIndex } = await params;
    const index = Number(encodedIndex);
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_PART_BYTES) {
      return noStoreJson({ error: "Encrypted part is too large" }, { status: 413 });
    }
    const transfer = await getTransfer(id);
    if (!transfer) return noStoreJson({ error: "Transfer not found" }, { status: 404 });
    await storeCiphertextPart(transfer, index, await request.arrayBuffer());
    return noStoreJson({ uploaded: true, index });
  } catch (error) {
    return jsonError(error);
  }
}
