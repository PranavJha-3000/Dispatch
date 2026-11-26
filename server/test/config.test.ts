import { describe, it, expect } from "vitest";
import { loadConfig } from "../src/config.js";

const base = { DATABASE_URL: "postgresql://x", JWT_SECRET: "x".repeat(32) };

describe("config", () => {
  it("refuses to boot in production with FAIL_HANDLER set", () => {
    expect(() => loadConfig({ ...base, NODE_ENV: "production", FAIL_HANDLER: "email" })).toThrow();
  });
  it("honours FAIL_HANDLER outside production", () => {
    expect(loadConfig({ ...base, NODE_ENV: "development", FAIL_HANDLER: "email" }).failHandler).toBe("email");
  });
  it("rejects a short JWT secret", () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: "short" })).toThrow();
  });
});
