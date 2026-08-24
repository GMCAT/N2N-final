import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { createRoom } from "@/server/rooms";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const permit = await enforceRateLimit(request, "create-room", 30, 10 * 60 * 1000);
    const result = await createRoom(permit.key);
    return noStoreJson(result, { status: result.queued ? 202 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
