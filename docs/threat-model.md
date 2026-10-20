# Threat model

The service will process repository source code and GitHub credentials. The
initial supported-language, exclusion, and resource-limit policy is documented
in [scope.md](./scope.md). Treat repository contents as untrusted input, keep
credentials server-side, and never execute scanned code with access to host
secrets or the network.

Phase 2 enforces path allowlisting, source-file exclusions, size/count/time
limits, bounded compiler output, temporary source staging, and safe subprocess
invocation for the local fixture workflow. It does not implement authentication,
GitHub access, persistent storage, or production-grade multi-tenant isolation.
Do not expose the local analyzer service to untrusted networks or use it to
process user repositories until those controls are designed and tested.
