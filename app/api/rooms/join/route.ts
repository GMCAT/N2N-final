import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { joinRoom } from "@/server/rooms";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "join-room", 5, 10 * 60 * 1000);
    const input = await request.json() as { code?: unknown };
    return noStoreJson(await joinRoom(input.code));
  } catch (error) {
    return jsonError(error);
  }
}
