import assert from "node:assert/strict";
import { test } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "./server.js";

async function withServer(
  fn: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const server = createApp();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
  }
}

test("GET /healthz returns 200 ok", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/healthz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ok" });
  });
});

test("GET /readyz returns 200 ready", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/readyz`);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { status: "ready" });
  });
});

test("unknown route returns 404", async () => {
  await withServer(async (baseUrl) => {
    const res = await fetch(`${baseUrl}/nope`);
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { error: "not found" });
  });
});
