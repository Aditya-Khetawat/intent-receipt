import { afterEach, describe, expect, it, vi } from "vitest";
import { clientIp, rateLimit, resetRateLimits } from "@/lib/http";

const req = (xff?: string, extra: Record<string, string> = {}) =>
  new Request("http://localhost/api/x", { headers: { ...(xff ? { "x-forwarded-for": xff } : {}), ...extra } });

describe("clientIp", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("uses the rightmost X-Forwarded-For hop, ignoring client-supplied entries", () => {
    expect(clientIp(req("6.6.6.6, 203.0.113.9").headers)).toBe("203.0.113.9");
    expect(clientIp(req("203.0.113.9").headers)).toBe("203.0.113.9");
    expect(clientIp(req().headers)).toBe("local");
  });

  it("prefers a configured trusted header", () => {
    vi.stubEnv("TRUSTED_CLIENT_IP_HEADER", "CF-Connecting-IP");
    expect(clientIp(req("6.6.6.6, 10.0.0.1", { "cf-connecting-ip": "198.51.100.7" }).headers)).toBe("198.51.100.7");
    expect(clientIp(req("6.6.6.6, 10.0.0.1").headers)).toBe("10.0.0.1");
  });
});

describe("rateLimit", () => {
  afterEach(() => resetRateLimits());

  it("cannot be bypassed by rotating a spoofed leftmost X-Forwarded-For value", () => {
    const statuses = Array.from({ length: 4 }, (_, i) => rateLimit(req(`1.1.1.${i}, 203.0.113.9`), "t", 3)?.status ?? 200);
    expect(statuses).toEqual([200, 200, 200, 429]);
  });

  it("enforces a global cap per bucket", () => {
    const statuses = Array.from({ length: 11 }, (_, i) => rateLimit(req(`203.0.113.${i}`), "g", 1)?.status ?? 200);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
