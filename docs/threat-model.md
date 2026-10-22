# Threat model

The application processes untrusted repository source and GitHub authorization
credentials. The supported source policy and caps are in [scope.md](./scope.md).

## Assets and trust boundaries

- GitHub App client secret and OAuth access/refresh tokens.
- Repository metadata, commit identifiers, Git tree/blob responses, and source.
- The analyzer process, temporary staging directory, and scan response.

The browser is untrusted. It can propose repository IDs, SHAs, filters, and
requests, but Next.js revalidates authorization and commit ownership using the
server-held user token. The analyzer accepts GitHub source only with a separate
shared API key and revalidates file paths and content limits.

## Authentication and authorization controls

- OAuth `state` is generated with a cryptographically secure random value and
  checked against a short-lived HttpOnly cookie using a constant-time compare.
- Callback origin/path come only from server configuration. Success and error
  redirects use a fixed `/repositories` path; no browser-provided redirect
  target is accepted.
- OAuth tokens are stored only in an AES-256-GCM encrypted, HttpOnly,
  SameSite=Lax cookie with Secure enabled in production and an eight-hour
  maximum session. No token is sent to client JavaScript, a database, logs,
  URLs, or the analyzer workspace.
- Session expiration is checked on each server route. GitHub 401/403 and rate
  limit failures map to safe generic errors; upstream error bodies are not
  echoed. Expiring GitHub user tokens are refreshed server-side where a refresh
  token is supplied.
- State-changing scan/disconnect requests require a session-bound CSRF token in
  a custom header. The cookie uses SameSite=Lax.
- Repository IDs are checked against the authenticated user's App installation
  repositories for every commit and scan operation. Commit SHA format and
  repository-specific reachability are checked before tree/blob retrieval.
- Disconnect clears the local cookie and attempts GitHub authorization
  revocation. If upstream revocation cannot be confirmed, the UI reports that
  the user may revoke the app from GitHub settings.

## Source and analyzer controls

- The GitHub service calls only `https://api.github.com` for repository data and
  uses explicit, encoded route segments. It retrieves Git blob content by SHA;
  it does not follow `download_url` values, clone repositories, or extract
  archives.
- Git tree paths are canonicalized. Symlinks, submodules, sensitive filenames,
  generated/dependency directories, unsupported files, oversized content,
  binary content, and non-UTF-8 blobs are excluded.
- Repository source is held in memory during retrieval and analysis. The
  analyzer writes only validated relative paths into a unique temporary
  directory and removes it on exit. It never runs repository scripts or
  installs dependencies.
- The analyzer subprocess has a fixed command line, no shell, a restricted
  environment, no module resolution, a timeout, and an output cap.
- Partial retrieval, truncated tree results, and analyzer failures are
  represented in status/errors; partial results are not labeled complete.
- `ANALYZER_API_KEY` must be private and identical in both server processes.
  Bind FastAPI to loopback or an authenticated private network.

## Remaining risks and deployment requirements

- The session token is encrypted client-side storage protected from browser
  JavaScript but still sent as a cookie; use HTTPS, secure secret management,
  and a restrictive deployment origin.
- The scan rate limiter is in-memory and process-local. It is not a distributed
  abuse control.
- Temporary source staging and analyzer execution are not a hardened
  multi-tenant sandbox. Keep the analyzer private and avoid public shared
  deployment until container/process isolation, resource quotas, and audit
  requirements are reviewed.
- GitHub recursive trees may be truncated. Such scans warn and return partial
  status when any findings are still available.
- No durable scan history, deletion workflow, background cancellation,
  automated fixes, write access, or AI processing is present.
