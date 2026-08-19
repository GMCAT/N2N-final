import assert from "node:assert/strict";
import test from "node:test";
import { applySecurityHeaders, createContentSecurityPolicy } from "../lib/security-headers.ts";
import { assertSameOrigin } from "../server/http.ts";

test("builds a nonce-based production CSP without eval", () => {
  const policy = createContentSecurityPolicy("random-nonce");
  assert.match(policy, /script-src 'self' 'nonce-random-nonce' 'strict-dynamic'/u);
  assert.match(policy, /object-src 'none'/u);
  assert.match(policy, /frame-ancestors 'none'/u);
  assert.match(policy, /connect-src 'self'/u);
  assert.doesNotMatch(policy, /unsafe-eval/u);
});

test("sets browser isolation and privacy headers", () => {
  const headers = applySecurityHeaders(new Headers({ Server: "hidden" }), "default-src 'self'");
  assert.equal(headers.get("referrer-policy"), "no-referrer");
  assert.equal(headers.get("x-frame-options"), "DENY");
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(headers.get("server"), null);
});

test("accepts same-origin mutations and rejects cross-origin requests", () => {
  assert.doesNotThrow(() => assertSameOrigin(new Request("https://n2n.example/api", {
    method: "POST",
    headers: { Origin: "https://n2n.example", "Sec-Fetch-Site": "same-origin" },
  })));
  assert.throws(() => assertSameOrigin(new Request("https://n2n.example/api", {
    method: "POST",
    headers: { Origin: "https://attacker.example", "Sec-Fetch-Site": "cross-site" },
  })), /Cross-origin request rejected/u);
});

