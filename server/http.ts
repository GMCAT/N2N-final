export function jsonError(error: unknown, fallbackStatus = 500): Response {
  const message = error instanceof Error ? error.message : "Unexpected error";
  if (error instanceof HttpError) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    if (error.retryAfterSeconds) headers.set("Retry-After", String(error.retryAfterSeconds));
    return Response.json(
      { error: message, retryAfterSeconds: error.retryAfterSeconds },
      { status: error.status, headers },
    );
  }
  const clientError = /must be|not pending|expired|size does not match|incomplete|cannot be completed|Invalid deletion token|Part index|part size|Unsupported transfer|Invalid fileId|room code/u.test(message);
  return Response.json({ error: message }, { status: clientError ? 400 : fallbackStatus });
}

export class HttpError extends Error {
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(message: string, status: number, retryAfterSeconds?: number) {
    super(message);
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function noStoreJson(value: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(value, { ...init, headers });
}

export function assertSameOrigin(request: Request): void {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw new HttpError("Cross-origin request rejected", 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new HttpError("Cross-origin request rejected", 403);
}
