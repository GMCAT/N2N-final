import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { publishSignal, readSignals } from "@/server/rooms";

type Context = { params: Promise<{ id: string }> };

function bearer(request: Request): string {
  const authorization = request.headers.get("authorization") ?? "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
}

export async function GET(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const after = new URL(request.url).searchParams.get("after");
    return noStoreJson(await readSignals(id, bearer(request), after));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "room-signal", 600, 10 * 60 * 1000);
    const { id } = await params;
    const input = await request.json() as { kind?: unknown; payload?: unknown };
    return noStoreJson(await publishSignal(id, bearer(request), input.kind, input.payload), { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
