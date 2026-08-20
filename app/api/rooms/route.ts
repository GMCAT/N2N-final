import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { createRoom } from "@/server/rooms";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "create-room", 10, 10 * 60 * 1000);
    return noStoreJson(await createRoom(), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
