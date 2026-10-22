# Analyzer API

FastAPI is intended to bind to `127.0.0.1:8001`. The dashboard calls it through
same-origin Next.js routes, so browsers cannot choose an analyzer URL or
filesystem path. GitHub App secrets and OAuth tokens are used only by server
routes.

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

## GitHub App routes

The following Next.js routes require the configured GitHub App except where
noted:

- `GET /api/github/connect` starts the user-authorization flow. It accepts no
  callback or return URL from the browser.
- `GET /api/github/callback` validates OAuth state and callback parameters,
  exchanges the code server-side, and sets the encrypted session cookie.
- `GET /api/github/session` returns only `{configured, connected, login,
  csrfToken}`. It never returns access or refresh tokens.
- `POST /api/github/disconnect` requires `x-csrf-token`; it clears local session
  state and attempts GitHub authorization revocation.
- `GET /api/github/installations` returns account names for installations
  accessible to the authenticated user.
- `GET /api/repositories?page=1&q=owner%2Fname&visibility=all` returns
  paginated repository DTOs from the App installations. `visibility` is
  `all`, `public`, or `private`; `q` searches owner/full name.
- `GET /api/repositories/{repositoryId}/commits?page=1` first verifies the
  repository is in the authorized installation list, then returns recent full
  SHAs and commit summaries.
- `POST /api/github/scans` requires `x-csrf-token` and accepts only:

  ```json
  {"repositoryId": 12345, "commitSha": "0123456789abcdef0123456789abcdef01234567"}
  ```

  The web server revalidates repository access and the full SHA, retrieves
  permitted blobs at that commit, then invokes FastAPI with the server-side
  `ANALYZER_API_KEY`. It returns normalized `findings`, `analyzers`, `files`,
  `errors`, `repositoryFullName`, and `commitSha`. The browser cannot provide a
  URL, owner/name pair, filesystem path, source files, or analyzer address.

GitHub API failures are mapped to generic structured errors. A missing/expired
session returns `401`, CSRF validation failure returns `403`, GitHub rate limit
returns `429`, invalid request data returns `400`/`422`, and unavailable
upstream services return `502`/`503`. Upstream response bodies and credentials
are not forwarded.

The web layer caps source retrieval at 500 files, 1 MiB per file, 20 MiB total,
50,000 tree entries, and five scans per connected account per 15-minute web
process. Truncated GitHub trees and source-retrieval limits are reported in
`errors` and produce `partial` status where results are available.

## `POST /analyze/sources` (web service only)

This FastAPI route is disabled unless `ANALYZER_API_KEY` is set. Requests must
include the matching `x-analyzer-api-key` header and a bounded JSON body:

```json
{
  "repositoryFullName": "owner/repository",
  "commitSha": "0123456789abcdef0123456789abcdef01234567",
  "files": [
    {"path": "src/App.ts", "content": "const count: number = 1;"}
  ]
}
```

It rejects malformed repository names/SHAs, traversal and non-canonical paths,
duplicate files, invalid UTF-8, and configured size/count violations.
Unsupported or sensitive paths are recorded as skipped. Source text is staged
temporarily and analyzed with the same adapter and finding normalizer as local
fixtures. The analyzer endpoint must remain on loopback or a trusted private
network; do not expose it publicly.
