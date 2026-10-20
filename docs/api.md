# Analyzer API

The FastAPI service is intended to bind to `127.0.0.1:8001`. The dashboard
calls it through same-origin Next.js routes, so browser clients do not select
an analyzer URL or submit filesystem paths.

## `GET /health`

Returns `{"status":"ok"}` when the API process is responsive. It does not
guarantee that Node.js or the TypeScript compiler is installed.

## `GET /fixtures`

Returns only fixture IDs present in the server-side fixture registry:

```json
{
  "fixtures": [
    {
      "id": "buggy-react-app",
      "name": "Buggy React App",
      "description": "Intentionally includes deterministic TypeScript diagnostics."
    }
  ]
}
```

The response also lists `clean-react-app` when it is available. No fixture
filesystem paths are returned.

## `POST /analyze`

Request JSON:

```json
{"fixtureId":"buggy-react-app"}
```

Only the two IDs returned by `/fixtures` are accepted. Extra properties,
unsupported IDs, and client-supplied paths are rejected. Request bodies are
limited to 4 KiB.

Successful HTTP responses include `id`, `fixtureId`, `status`, `findings`,
`files`, `analyzers`, `errors`, `startedAt`, and `finishedAt`. Scan status is
`completed`, `partial`, or `failed`. A partial or failed status is not a
successful complete scan.

Finding objects use the Phase 1 camelCase Pydantic contract, including
`category`, `severity`, `filePath`, `startLine`, `endLine`, and `evidence`.
Analyzer-generated findings also carry a stable `fingerprint`, `analyzer`,
`ruleId`, `needs_review` status, and `not_run` verification state. Confidence
is left unset; compiler diagnostics do not establish that a defect is
confirmed.

`files` reports each included file or skipped path/directory with a reason.
Paths are relative to the selected fixture and source contents are never
included in this inventory.

Invalid request bodies return `400`, unknown fixture IDs return `422`,
oversized requests return `413`, and an unexpected internal analysis error
returns a generic `500` response. Missing tools, timeouts, output limits,
unresolved imports, and scan limits are reported in analyzer/scan status
without returning subprocess output or stack traces.

## Dashboard proxy

The same-origin Next.js routes are:

- `GET /api/analyzer/health`
- `GET /api/analyzer/fixtures`
- `POST /api/analyzer/scans` with `{"fixtureId":"clean-react-app"}`

The proxy reads `ANALYZER_URL` from the server environment, defaulting to
`http://127.0.0.1:8001`, and restricts scan requests to the same fixture IDs.
