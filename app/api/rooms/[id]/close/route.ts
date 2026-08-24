import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { closeRoom } from "@/server/rooms";
import { releaseRateLimit } from "@/server/rate-limit";

type Context = { params: Promise<{ id: string }> };
export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const result = await closeRoom(id, token);
    if (result.createRateKey) await releaseRateLimit(result.createRateKey);
    return noStoreJson({ closed: true });
  } catch (error) { return jsonError(error); }
}
