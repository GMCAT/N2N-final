import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { getTransfer, storeCiphertext } from "@/server/transfers";

const MAX_LEGACY_PACKAGE_BYTES = 36 * 1024 * 1024;

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "legacy-upload", 30);
    const { id } = await params;
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_LEGACY_PACKAGE_BYTES) {
      return noStoreJson({ error: "Encrypted package is too large" }, { status: 413 });
    }
    const transfer = await getTransfer(id);
    if (!transfer) return noStoreJson({ error: "Transfer not found" }, { status: 404 });
    const body = await request.arrayBuffer();
    if (body.byteLength > MAX_LEGACY_PACKAGE_BYTES) {
      return noStoreJson({ error: "Encrypted package is too large" }, { status: 413 });
    }
    await storeCiphertext(transfer, body);
    return noStoreJson({ uploaded: true });
  } catch (error) {
    return jsonError(error);
  }
}
