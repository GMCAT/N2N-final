/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { cleanupExpiredTransfers } from "../server/transfers";
import { applySecurityHeaders, createContentSecurityPolicy } from "../lib/security-headers";
import { cleanupRateLimits } from "../server/rate-limit";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  FILES: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

interface ScheduledEvent {
  scheduledTime: number;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const nonceBytes = crypto.getRandomValues(new Uint8Array(18));
    const nonce = btoa(String.fromCharCode(...nonceBytes));
    const development = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    const policy = createContentSecurityPolicy(nonce, development);
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("Content-Security-Policy", policy);
    const securedRequest = new Request(request, { headers: requestHeaders });

    let response: Response;

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      response = await handleImageOptimization(securedRequest, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    } else {
      response = await handler.fetch(securedRequest, env, ctx);
    }
    const headers = applySecurityHeaders(new Headers(response.headers), policy);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
  async scheduled(event: ScheduledEvent, _env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(cleanupExpiredTransfers(event.scheduledTime));
    ctx.waitUntil(cleanupRateLimits(event.scheduledTime - 2 * 60 * 60 * 1000));
  },
};

export default worker;
