# Bug Detective

Bug Detective is a monorepo scaffold for analyzing repository code and
investigating findings.

## Project structure

- `apps/web` — Next.js dashboard and API.
- `services/analyzer` — Python analyzer service.
- `packages/shared-types` — shared TypeScript API types.
- `fixtures` — sample repositories for analyzer tests.
- `docs` — architecture and threat-model notes.

## Development

Install dependencies from the repository root:

```bash
npm install
```

Start the dashboard:

```bash
npm run dev
```

Start the analyzer service (after installing its Python dependencies):

```bash
cd services/analyzer
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload
```

The analyzer health endpoint is available at `http://localhost:8000/health`.
Copy `.env.example` to `.env.local` and configure credentials when implementing
GitHub integration. For Next.js, place the local file at
`apps/web/.env.local`.

Run analyzer tests from `services/analyzer`:

```bash
python -m pytest
```

The initial source-language, exclusion, resource-limit, and threat-boundary
policy is recorded in [docs/scope.md](docs/scope.md).

## API scaffold

The routes are created but intentionally return HTTP `501 Not Implemented`
until their backing GitHub, scan-storage, analyzer, and AI behavior is added.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/github/installations` | List GitHub App installations |
| `GET` | `/api/repositories` | List accessible repositories |
| `POST` | `/api/scans` | Start a repository scan |
| `GET` | `/api/scans/:scanId` | Get scan status and summary |
| `GET` | `/api/scans/:scanId/findings` | List findings with filtering and pagination |
| `GET` | `/api/scans/:scanId/findings/:findingId` | Get finding evidence and explanation |
| `POST` | `/api/scans/:scanId/findings/:findingId/explain` | Request an AI explanation |
| `POST` | `/api/scans/:scanId/findings/:findingId/verify` | Run supported verification checks |
| `DELETE` | `/api/scans/:scanId` | Delete a scan and its stored results |
