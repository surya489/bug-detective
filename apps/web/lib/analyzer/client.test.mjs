import assert from "node:assert/strict";
import { test } from "node:test";
import { AnalyzerClientError, getAnalyzerHealth } from "./client.ts";

const env = { ANALYZER_BASE_URL: "https://analyzer.internal/" };

test("requests health from the configured analyzer binding", async () => {
  let requestedUrl;
  let requestSignal;

  const health = await getAnalyzerHealth({
    env,
    timeoutMs: 1_250,
    fetcher: async (input, init) => {
      requestedUrl = new URL(String(input));
      requestSignal = init.signal;
      return Response.json({ status: "ok" });
    },
  });

  assert.deepEqual(health, { status: "ok" });
  assert.equal(requestedUrl.href, "https://analyzer.internal/health");
  assert.ok(requestSignal instanceof AbortSignal);
  assert.equal(requestSignal.aborted, false);
});

test("rejects missing or invalid service URLs without making a request", async () => {
  await assert.rejects(
    getAnalyzerHealth({ env: {} }),
    (error) => error instanceof AnalyzerClientError && error.code === "not_configured",
  );

  for (const value of [
    "not a URL",
    "ftp://analyzer.internal",
    "https://user:password@analyzer.internal",
    "https://analyzer.internal/?token=secret",
  ]) {
    await assert.rejects(
      getAnalyzerHealth({ env: { ANALYZER_BASE_URL: value } }),
      (error) =>
        error instanceof AnalyzerClientError &&
        error.code === "invalid_configuration",
    );
  }
});

test("returns a safe error for non-success upstream responses", async () => {
  await assert.rejects(
    getAnalyzerHealth({
      env,
      fetcher: async () =>
        new Response("private upstream detail", { status: 503 }),
    }),
    (error) =>
      error instanceof AnalyzerClientError &&
      error.code === "upstream_error" &&
      error.upstreamStatus === 503 &&
      !error.message.includes("private"),
  );
});

test("maps aborted requests to a timeout error", async () => {
  await assert.rejects(
    getAnalyzerHealth({
      env,
      timeoutMs: 10,
      fetcher: async (_input, init) =>
        new Promise((resolve, reject) => {
          init.signal.addEventListener(
            "abort",
            () => reject(init.signal.reason),
            { once: true },
          );
        }),
    }),
    (error) => error instanceof AnalyzerClientError && error.code === "timeout",
  );
});

test("rejects malformed JSON and unexpected health payloads", async () => {
  await assert.rejects(
    getAnalyzerHealth({
      env,
      fetcher: async () =>
        new Response("not-json", {
          headers: { "Content-Type": "application/json" },
        }),
    }),
    (error) =>
      error instanceof AnalyzerClientError && error.code === "invalid_response",
  );

  await assert.rejects(
    getAnalyzerHealth({
      env,
      fetcher: async () => Response.json({ status: "unknown" }),
    }),
    (error) =>
      error instanceof AnalyzerClientError && error.code === "invalid_response",
  );
});
