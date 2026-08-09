import { describe, it, expect } from "bun:test";
import { clx, clsx } from "../clx.ts";

describe("sdk/clx", () => {
  it("joins non-empty class names", () => {
    expect(clx("a", "b", "c")).toBe("a b c");
  });

  it("filters out null/undefined/false", () => {
    expect(clx("a", null, "b", undefined, false, "c")).toBe("a b c");
  });

  it("minifies repeated whitespace", () => {
    expect(clx("a   b", "  c  ")).toBe("a b c");
  });

  it("returns empty string when nothing to join", () => {
    expect(clx(null, undefined, false)).toBe("");
  });

  it("clsx alias behaves the same", () => {
    expect(clsx("x", "y")).toBe("x y");
  });
});
