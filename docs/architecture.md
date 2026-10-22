# Architecture

- `apps/web` contains the Next.js dashboard, OAuth callback/session routes,
  GitHub API service, repository browser, and same-origin API handlers.
- `services/analyzer` contains FastAPI, safe discovery/staging, the TypeScript
  adapter, and shared finding normalization.
- `packages/shared-types` contains the web's API and UI contracts.
- `fixtures` contains the two explicitly allowlisted local test applications.

## GitHub request flow

1. The browser starts a GitHub App user-authorization flow. The callback URI is
   fixed by server configuration; a short-lived HttpOnly cookie binds the OAuth
   state. Callback parameters are validated before exchanging the code.
2. The web server encrypts the user access/refresh token in an AES-GCM
   HttpOnly, SameSite=Lax cookie. The eight-hour session is not persisted in a
   database. Mutating routes require a session-bound CSRF header.
3. The server lists the user's App installations and the repositories returned
   by those installation APIs. Repository IDs from the browser are revalidated
   against that list before commit access.
4. Commits are retrieved from the selected authorized repository. Scan
   initiation accepts only a repository ID and a full 40-character SHA; the
   server verifies that SHA through the repository-specific commit endpoint.
5. A recursive Git tree is fetched at the immutable SHA. The web service filters
   paths and sizes before retrieving Base64 Git blobs from the fixed
   `api.github.com` origin. It does not follow repository-provided URLs or
   download archives.
6. Validated UTF-8 text is sent over the server-side analyzer connection with a
   shared `ANALYZER_API_KEY`. FastAPI validates paths and content limits again,
   writes only those files to a unique temporary directory, and reuses the same
   TypeScript adapter and finding normalizer as fixture scans. Temporary
   staging is cleaned after completion or error.
7. The response reports analyzer status, normalized findings, included/skipped
   files, repository name, and the full commit SHA. Nothing is stored as scan
   history.

Local fixture scans remain separate and continue to accept only the two
server-registered fixture IDs. The analyzer does not install dependencies,
resolve imports, execute repository code, or persist repository copies.

## Boundaries

- GitHub secrets and user tokens are read only in server modules.
- GitHub permissions are Contents: Read-only and GitHub-required Metadata:
  Read-only.
- Repository data is returned as a minimal DTO; token, installation token,
  private key, and upstream error bodies are never returned.
- The analyzer source endpoint is disabled unless a shared API key is
  configured. It should remain on loopback or a trusted private network.
- The per-account scan rate limit is in-memory per web process. It is not a
  distributed quota and is not production multi-tenant isolation.
