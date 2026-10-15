import { afterEach, describe, expect, it, vi } from "vitest";
import { sameOrigin } from "./http";

const req = (url: string, headers: Record<string, string>) => new Request(url, { method: "PUT", headers });

describe("sameOrigin", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows requests without an Origin header, and from this site", () => {
    expect(sameOrigin(req("http://localhost:3000/api/draft", {}))).toBe(true);
    expect(sameOrigin(req("http://localhost:3000/api/draft", { origin: "http://localhost:3000" }))).toBe(true);
  });

  it("refuses other sites", () => {
    expect(sameOrigin(req("http://localhost:3000/api/draft", { origin: "https://evil.example", host: "localhost:3000" }))).toBe(false);
    expect(sameOrigin(req("http://localhost:3000/api/draft", { origin: "not a url" }))).toBe(false);
  });

  it("matches the host the browser asked for when the server sees its bind address (standalone, behind a proxy)", () => {
    const url = "http://0.0.0.0:3000/api/draft";
    expect(sameOrigin(req(url, { origin: "http://localhost:3000", host: "localhost:3000" }))).toBe(true);
    expect(sameOrigin(req(url, { origin: "https://stories.springpod.com", host: "10.0.1.7:3000", "x-forwarded-host": "stories.springpod.com" }))).toBe(true);
    vi.stubEnv("APP_URL", "https://stories.springpod.com");
    expect(sameOrigin(req(url, { origin: "https://stories.springpod.com", host: "10.0.1.7:3000" }))).toBe(true);
    expect(sameOrigin(req(url, { origin: "https://evil.example", host: "10.0.1.7:3000" }))).toBe(false);
  });
});
