# Bug Detective AI

Bug Detective is a local-first static analyzer with a Next.js dashboard and
FastAPI analysis service. It supports deterministic local-fixture scans and
read-only GitHub App access to authorized repositories. GitHub scans are pinned
to a full commit SHA; scan results are not persisted.

## Prerequisites

- Node.js 20.9 or newer and npm.
- Python 3.11 or newer.
- Network access to install declared dependencies and contact GitHub when using
  the GitHub integration.

The analyzer uses the TypeScript compiler installed in this workspace. Target
repositories do not install dependencies or run package scripts.

## Install dependencies

From the repository root:

```powershell
npm install
Set-Location services\analyzer
python -m pip install -e ".[dev]"
Set-Location ..\..
```

## Configure a GitHub App

1. In GitHub, open **Settings → Developer settings → GitHub Apps → New GitHub
   App**.
2. Set the homepage URL to `http://localhost:3000` for local development.
3. Set the callback URL to exactly
   `http://localhost:3000/api/github/callback`. For deployment, use the HTTPS
   callback URL on that deployment's own origin.
4. Grant **Repository permissions → Contents: Read-only**. GitHub's required
   repository **Metadata: Read-only** permission is also enabled. Do not grant
   write permissions or configure webhooks for this phase.
5. Enable user authorization during installation and leave the OAuth callback
   URL set to the same callback above.
6. Install the app on the account or organization containing the repositories
   you want to analyze. Only repositories available through those installations
   and to the authenticated user are listed.
7. Copy the App's Client ID and generate a client secret.

This flow uses the GitHub App's user-to-server OAuth token; it does not require
the App ID or a private key. OAuth state is checked against a short-lived
HttpOnly cookie. The access/refresh tokens are kept only in an AES-256-GCM
encrypted HttpOnly session cookie, never in JavaScript, a database, the source
workspace, or logs. Sessions expire after eight hours. Disconnect requests
revoke the GitHub App authorization where possible and always clear the local
session.

## Configure local environment

Copy the example to the Next.js app's local environment file:

```powershell
Copy-Item .env.example apps\web\.env.local
```

Edit `apps\web\.env.local` and set:

- `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` from the GitHub App.
- `GITHUB_CALLBACK_URL=http://localhost:3000/api/github/callback`.
- `GITHUB_SESSION_SECRET` to a fresh 32-byte base64url key.
- `ANALYZER_API_KEY` to a separate, fresh random secret.

Generate values with Node.js; keep the output out of source control:

```powershell
node -p "require('node:crypto').randomBytes(32).toString('base64url')"
```

Use one generated value for `GITHUB_SESSION_SECRET` and another for
`ANALYZER_API_KEY`. The analyzer must receive the same `ANALYZER_API_KEY` as the
web app. In the analyzer terminal, load it from the local web env file without
printing it:

```powershell
$env:ANALYZER_API_KEY = (Get-Content apps\web\.env.local | Where-Object { $_ -match '^ANALYZER_API_KEY=' } | Select-Object -First 1) -replace '^ANALYZER_API_KEY=', ''
```

Never commit `.env.local`, client secrets, generated keys, or downloaded GitHub
private keys. `.gitignore` excludes local env and credential files; `.env.example`
contains placeholders only.

## Start the application

Start FastAPI from the repository root in one terminal:

```powershell
Set-Location services\analyzer
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

Start the web app in a second terminal:

```powershell
npm run dev
```

Open `http://localhost:3000`. The analyzer binds to loopback only; its API docs
are at `http://127.0.0.1:8001/docs`. Fixture scans work without GitHub
credentials. GitHub scans additionally require both services to share
`ANALYZER_API_KEY`.

## Connect and scan a repository

1. Open **Repositories** in the dashboard and select **Connect GitHub**.
2. Authorize the GitHub App and install it for the account/repositories to
   analyze.
3. Search or filter the authorized repository list and select a repository.
4. Select a recent commit. The UI shows its full SHA before scan initiation.
5. Start the scan. The server rechecks repository access and verifies the commit
   against that repository, fetches eligible Git blobs at that immutable SHA,
   and sends validated text to the existing analyzer.
6. Review actual findings, analyzer status, and the file-skip inventory. A
   partial or failed scan is not presented as complete.
7. Use **Disconnect** to clear the local session and request GitHub token
   revocation.

## Local fixture scans

The dashboard continues to offer the `buggy-react-app` and `clean-react-app`
fixtures. The buggy fixture is expected to report `TS2322` (a type mismatch)
and `TS6133` (an unused declaration). Findings are compiler evidence for review,
not confirmed defects.

## Tests and checks

From the repository root:

```powershell
python -m pytest -q
npm run test:web
npm run lint
npm run build
```

GitHub API, session, source filtering, and route tests use mocked responses and
do not require a real GitHub account or credentials.

## Security limits and known limitations

- GitHub permission is read-only Contents plus required Metadata; no branch
  writes, pull requests, comments, or fixes are implemented.
- Only JavaScript/TypeScript source and selected JSON configuration files are
  eligible. `.env*`, credentials, private keys, lockfiles, symlinks, submodules,
  generated/dependency directories, unsupported files, binary content, and
  invalid UTF-8 are excluded.
- GitHub retrieval is bounded to 500 files, 1 MiB/file, 20 MiB total, 50,000
  tree entries, and five scans per account per 15 minutes. GitHub's recursive
  tree response can be truncated; that condition is reported as partial.
- The analyzer stages only validated files in a unique temporary directory,
  uses a fixed compiler invocation with no shell and no module resolution, and
  does not execute repository code or install dependencies.
- `ANALYZER_API_KEY` protects the repository-source analyzer endpoint. Keep the
  analyzer bound to loopback or a trusted private network; do not expose it
  publicly. The scan rate limiter is per web process, not distributed.
- The encrypted cookie is stateless; local session revocation clears the
  browser cookie and attempts GitHub revocation. If GitHub revocation is
  unavailable, revoke the app authorization from GitHub settings.
- Scan results and source files are not persisted. There is no scan history,
  background job system, cancellation, multi-tenant isolation, or AI feature in
  this phase.
- Deployments need HTTPS, a secure secret manager, request-duration limits that
  permit scans, and a trusted private analyzer connection. These local MVP
  controls alone are not a certification for a public multi-tenant service.

See [docs/scope.md](docs/scope.md), [docs/api.md](docs/api.md),
[docs/architecture.md](docs/architecture.md), and
[docs/threat-model.md](docs/threat-model.md).
