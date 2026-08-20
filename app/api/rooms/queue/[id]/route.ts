import { assertSameOrigin, jsonError, noStoreJson } from "@/server/http";
import { leaveQueue, queuedRoom } from "@/server/rooms";

type Context = { params: Promise<{ id: string }> };
function bearer(request: Request): string { const value = request.headers.get("authorization") ?? ""; return value.startsWith("Bearer ") ? value.slice(7) : ""; }

export async function POST(request: Request, { params }: Context) {
  try { assertSameOrigin(request); const { id } = await params; return noStoreJson(await queuedRoom(id, bearer(request))); }
  catch (error) { return jsonError(error); }
}

export async function DELETE(request: Request, { params }: Context) {
  try { assertSameOrigin(request); const { id } = await params; return noStoreJson(await leaveQueue(id, bearer(request))); }
  catch (error) { return jsonError(error); }
}
