import assert from "node:assert/strict";
import { test } from "node:test";
import { notImplemented } from "./not-implemented.ts";

test("the scan API returns a structured 501 until analysis is implemented", async () => {
  const response = notImplemented("Starting a repository scan");

  assert.equal(response.status, 501);
  assert.deepEqual(await response.json(), {
    error: {
      code: "NOT_IMPLEMENTED",
      message: "Starting a repository scan is not implemented yet.",
    },
  });
});
