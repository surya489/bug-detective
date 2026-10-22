# Scope and repository policy

This document records the supported source policy for local fixtures and the
Phase 3 GitHub read-only integration.

## Supported source languages

- JavaScript, JSX, TypeScript, and TSX are analyzed by the TypeScript compiler.
- Selected JSON configuration (`package.json`, `tsconfig.json`, `jsconfig.json`,
  and `.prettierrc.json`) may be staged as context but is not passed to the
  compiler.
- Other languages are out of scope.

## Excluded repository content

Do not retrieve or stage:

- `.env*`, credentials, passwords, private keys, token/secret-named files, and
  sensitive key formats.
- Symlinks, Git submodules, binaries, invalid UTF-8, lockfiles, unsupported
  extensions, and generated/dependency folders (`.git`, `node_modules`,
  `.next`, `dist`, `build`, `coverage`, `generated`, vendored content, and
  virtual environments).
- Paths that are absolute, non-canonical, contain traversal segments, backslash
  separators, or control characters.

Repository ignore files do not override the sensitive-content denylist. GitHub
blobs are decoded from the API's declared Base64 encoding and accepted only if
their reported size matches and they contain valid UTF-8 text.

## Resource limits

### GitHub source retrieval

- 500 eligible files.
- 1 MiB per file.
- 20 MiB total source content.
- 50,000 recursive tree entries.
- 5 minutes of source retrieval.
- 5 scan requests per connected account per 15-minute window per web process.

If GitHub truncates its recursive tree or a size, count, timeout, or retrieval
limit prevents complete coverage, the response includes a warning and a partial
status where results are available. Individual unsupported or sensitive files
are reported as skipped without exposing their contents.

### Analyzer

- 10,000 files.
- 1 MiB per file.
- 50 MiB total source content.
- 50,000 discovered filesystem entries.
- 5 minutes overall scan duration.
- 30 seconds per analyzer run.
- 1 MiB combined compiler output.
- 1,000 returned findings.

Analyzer limits are configurable through the `ANALYZER_MAX_*` process
environment variables listed in `.env.example`. Limits are enforced by the
service; no target repository script, build hook, or dependency installation is
performed.

## Threat boundaries

- Git repositories, filenames, commit messages, source, and API responses are
  untrusted.
- Only read-only GitHub App permissions are used. No writes, pull requests, or
  comments are implemented.
- OAuth state, fixed callback destinations, encrypted HttpOnly sessions, CSRF
  headers, and server-side repository/commit checks protect the request flow.
- The analyzer-source endpoint requires a shared API key and should not be
  exposed to an untrusted network.
- Repository code is never executed. Analyzer subprocesses use a fixed argument
  list, no shell, a restricted environment, no module resolution, and bounded
  output/time.
- Source text is not sent to an AI provider and is not persisted as a repository
  copy. Results exist only in the active browser session.
- This local MVP does not provide distributed rate limits, durable/revocable
  server sessions, scan history, background jobs, or multi-tenant isolation.
  Public multi-tenant hosting requires additional isolation, secret management,
  transport, and operational review.

## API finding and scan contracts

Finding severity is `critical`, `high`, `medium`, `low`, or `info`; category is
`bug`, `security`, `performance`, or `maintainability`. Scan status is `queued`,
`running`, `completed`, `partial`, `failed`, or `cancelled`. API field names
use camelCase. Invalid enum values, extra fields, empty required text, and
invalid line ranges are rejected.

## Current implementation status

Fixture scans and GitHub read-only scanning share the deterministic analyzer
and normalized findings. GitHub access is limited to installed repositories
visible to the connected user and a full verified commit SHA. Scans do not
persist results or source.

The TypeScript compiler does not install dependencies, resolve imports, or read
repository `tsconfig` settings. Unresolved import diagnostics therefore produce
a partial result instead of a fabricated finding.
