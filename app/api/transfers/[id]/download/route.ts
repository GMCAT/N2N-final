import { assertSameOrigin, jsonError } from "@/server/http";
import { enforceRateLimit } from "@/server/rate-limit";
import { consumeDownload } from "@/server/transfers";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Context) {
  try {
    assertSameOrigin(request);
    await enforceRateLimit(request, "download-transfer", 100);
    const { id } = await params;
    const { body, size } = await consumeDownload(id);
    return new Response(body, {
      headers: {
        "Cache-Control": "no-store, private",
        "Content-Type": "application/vnd.n2n.encrypted",
        "Content-Length": String(size),
        "Content-Disposition": "attachment; filename=transfer.n2n",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return jsonError(error, 404);
  }
}
