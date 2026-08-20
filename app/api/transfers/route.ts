import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { createTransfer, validateChunkManifest, validateTransferPolicy } from "@/server/transfers";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "create-transfer", 20);
    const input = await request.json();
    const transfer = await createTransfer({
      ...validateTransferPolicy(input),
      ...validateChunkManifest(input),
    });
    return noStoreJson(
      {
        id: transfer.id,
        uploadUrl: `/api/transfers/${transfer.id}/content`,
        partUploadBaseUrl: `/api/transfers/${transfer.id}/parts`,
        completeUrl: `/api/transfers/${transfer.id}/complete`,
        deleteToken: transfer.deleteToken,
        expiresAt: transfer.expiresAt,
      },
      { status: 201 },
    );
  } catch (error) {
    return jsonError(error);
  }
}
