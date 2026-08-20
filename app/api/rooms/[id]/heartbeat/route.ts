import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { heartbeatRoom } from "@/server/rooms";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await params;
    const authorization = request.headers.get("authorization") ?? "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    return noStoreJson(await heartbeatRoom(id, token));
  } catch (error) {
    return jsonError(error);
  }
}
