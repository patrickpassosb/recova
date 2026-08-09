import { describe, it, expect } from "bun:test";
import debounce from "../debounce.ts";

describe("sdk/debounce", () => {
  it("delays invocation until the delay elapses", async () => {
    let calls = 0;
    const fn = debounce(() => {
      calls += 1;
    }, 30);
    fn();
    fn();
    fn();
    expect(calls).toBe(0); // not called synchronously
    await new Promise((r) => setTimeout(r, 60));
    expect(calls).toBe(1); // collapsed into a single call
  });

  it("passes through arguments to the wrapped function", async () => {
    const received: number[] = [];
    const fn = debounce((x: number) => {
      received.push(x);
    }, 10);
    fn(42);
    await new Promise((r) => setTimeout(r, 40));
    expect(received).toEqual([42]);
  });

  it("clear() cancels a pending call", async () => {
    let calls = 0;
    const fn = debounce(() => {
      calls += 1;
    }, 20);
    fn();
    fn.clear();
    await new Promise((r) => setTimeout(r, 50));
    expect(calls).toBe(0);
  });
});
