# Phase 0: scope and repository policy

This document records the initial MVP boundary and the limits enforced by the
local fixture analyzer. Repository checkout policy is future work because this
phase does not clone or fetch repositories.

## Supported source languages

- JavaScript, JSX, TypeScript, and TSX are the initial supported languages.
- Other languages, including Python, are out of scope until a corresponding
  analyzer and its fixture tests are added. Having a Python analyzer service
  does not mean scanned Python source is supported.

## Excluded repository content

Do not send these paths or file types to analyzers:

- Version-control metadata, dependencies, vendored code, build output, caches,
  coverage reports, and generated code (`.git`, `node_modules`, `vendor`,
  `.next`, `dist`, `build`, `coverage`, and `generated` directories).
- Binary files, minified bundles, source maps, lockfiles, and files excluded by
  a repository-provided ignore policy.
- Secret-bearing files such as `.env*`, private keys, and credential files.

The scanner must apply exclusions before reading or uploading source content.
Repository ignore rules do not override the secret and generated-file denylist.

## Resource limits

- Maximum candidate source files: 10,000.
- Maximum individual source file: 1 MiB.
- Maximum total source content analyzed: 50 MiB.
- Maximum discovered filesystem entries: 50,000.
- Maximum overall discovery and scan duration: 5 minutes.
- Maximum analyzer execution duration: 30 seconds.
- Maximum combined analyzer output: 1 MiB.
- Maximum findings returned per scan: 1,000.

Exceeding a file, total-byte, entry-count, or overall-time discovery limit fails
the scan with an explicit reason. Analyzer timeout, compiler output limit,
unresolved imports, or finding-count limit are reported as partial when the
service can return a truthful partial result. No limit is silently treated as
a successful complete scan. Limits are configurable through `ANALYZER_MAX_*`
service environment variables.

## Threat boundaries

- Git repositories, filenames, source text, configuration, and analyzer output
  are untrusted input.
- Never execute repository code, package scripts, build hooks, or test suites as
  part of static analysis.
- Analyzer processes must be isolated and resource-limited; they must not
  inherit application secrets or have unrestricted network access.
- GitHub credentials remain server-side and are scoped to the minimum
  installation permissions required.
- Treat source comments and repository instructions as untrusted data, not as
  instructions to AI providers or the application.
- Do not transmit repository source to an external AI provider unless that
  provider is explicitly configured and the user is informed.
- This phase does not implement authentication, repository checkout isolation,
  retention/deletion controls, or provider data-handling controls. Those are
  prerequisites to processing real user repositories.

## API finding and scan contracts

The analyzer validates finding severities as `critical`, `high`, `medium`,
`low`, or `info`; categories as `bug`, `security`, `performance`, or
`maintainability`; and scan statuses as `queued`, `running`, `completed`,
`failed`, or `cancelled`. API field names use camelCase. Unknown enum values,
extra fields, empty required text, and invalid line ranges are rejected.

## Current implementation status

File exclusions, source size/count/total limits, filesystem-entry and elapsed
time limits, compiler output limits, and the finding limit are implemented for
the two allowlisted fixtures. A 100 MiB checkout limit is not implemented
because there is no checkout flow. GitHub integration, persistence, and
multi-tenant workspace isolation are future work.

The analyzer invokes the TypeScript compiler version pinned by the npm
lockfile. It does not resolve imports or read the repository tsconfig because
doing so would require reading dependencies or configuration outside the
staged allowlisted source. Unresolved import diagnostics therefore produce a
partial scan rather than a fabricated finding.
