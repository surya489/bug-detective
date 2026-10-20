# Bug Detective AI

Bug Detective is a monorepo for a local-first static analyzer and dashboard.
Phase 2 scans only server-registered fixtures; GitHub integration, persistence,
AI explanations, verification, and arbitrary repository access are not enabled.

## Prerequisites

- Node.js 20.9 or newer and npm.
- Python 3.11 or newer.
- Network access to install the declared npm and Python dependencies.

TypeScript is run from the repository's npm installation. The current lockfile
pins TypeScript 5.9.3. Target fixtures do not install dependencies or run their
package scripts.

## Setup

Install the JavaScript workspace dependencies from the repository root:

```bash
npm install
```

Install the analyzer and its test dependencies:

```powershell
Set-Location services\analyzer
python -m pip install -e ".[dev]"
Set-Location ..\..
```

Optional settings and resource limits are listed in `.env.example`. Next.js
reads its server-side `ANALYZER_URL` from `apps/web/.env.local`; copy the example
there if you need to override the default `http://127.0.0.1:8001`. The FastAPI
service reads `ANALYZER_MAX_*` values from its process environment and otherwise
uses the defaults shown in the example.

## Start locally

Start the analyzer from the repository root:

```powershell
Set-Location services\analyzer
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

In a second terminal, start the dashboard:

```powershell
npm run dev
```

Open `http://localhost:3000`. The analyzer listens on loopback only. Its
interactive API documentation is at `http://127.0.0.1:8001/docs`.

## Run a fixture scan

The dashboard offers the `buggy-react-app` and `clean-react-app` fixtures. The
API accepts only those fixture IDs, never a client-supplied filesystem path:

```powershell
$body = @{ fixtureId = "buggy-react-app" } | ConvertTo-Json
Invoke-RestMethod -Method Post `
  -Uri http://127.0.0.1:8001/analyze `
  -ContentType "application/json" `
  -Body $body
```

Use `clean-react-app` for the clean fixture. The buggy fixture is expected to
report `TS2322` (a string type mismatch) and `TS6133` (an unused declaration).
Both results remain review-needed compiler diagnostics, not confirmed bugs.
The TypeScript adapter does not install target dependencies; unresolved imports
produce an explicit partial scan.

## Tests and checks

```powershell
Set-Location services\analyzer
python -m pytest
Set-Location ..\..
npm run lint
npm run build
```

## Phase 2 scope and limits

- Source extensions: JavaScript, JSX, TypeScript, and TSX; JSON configuration
  files are discovered but not passed to the compiler.
- Exclusions: `.env*`, credentials/private keys, binaries, unsupported types,
  and generated/dependency folders such as `.git`, `node_modules`, `.next`,
  `dist`, `build`, `coverage`, and virtual environments.
- Defaults: 10,000 files, 1 MiB per file, 50 MiB total analyzed content, 50,000
  filesystem entries, 300 seconds overall discovery/scan time, 30 seconds per
  analyzer run, 1 MiB combined compiler output, and 1,000 returned findings.
- Limits can be set through the `ANALYZER_MAX_*` process environment variables
  listed in `.env.example`.
- The analyzer copies only eligible files to a temporary staging directory.
  Compiler execution uses a fixed argument list, no shell, a restricted
  environment, no module resolution, no network access, and no target scripts.
- Scan results are held in dashboard memory only and are not persisted.
- GitHub repositories, production authentication, user-configurable paths,
  additional analyzers, AI explanations, and finding verification are future
  work. A 100 MiB repository checkout limit is a future GitHub/workspace policy;
  there is no checkout workflow in this phase.

See [docs/scope.md](docs/scope.md), [docs/api.md](docs/api.md),
[docs/architecture.md](docs/architecture.md), and
[docs/threat-model.md](docs/threat-model.md) for details.
