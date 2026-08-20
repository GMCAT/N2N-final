import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { createRoom } from "@/server/rooms";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "create-room", 10, 10 * 60 * 1000);
    const result = await createRoom();
    return noStoreJson(result, { status: result.queued ? 202 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
