import { describe, expect, it } from "vitest";
import { resolveProvider } from "./config.js";

describe("provider resolution", () => {
  it("keeps an explicitly configured real provider when a key exists", () => {
    expect(resolveProvider("dashscope", true)).toBe("dashscope");
    expect(resolveProvider("openai-compatible", true)).toBe("openai-compatible");
  });

  it("falls back to mock when a real provider is requested without a key", () => {
    expect(resolveProvider("dashscope", false)).toBe("mock");
    expect(resolveProvider("openai-compatible", false)).toBe("mock");
  });

  it("keeps mock and unknown values as-is so misconfiguration still surfaces later", () => {
    expect(resolveProvider("mock", false)).toBe("mock");
    expect(resolveProvider("something-else", true)).toBe("something-else");
  });
});
