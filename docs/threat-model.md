# Threat model

The service will process repository source code and GitHub credentials. The
initial supported-language, exclusion, and resource-limit policy is documented
in [scope.md](./scope.md). Treat repository contents as untrusted input, keep
credentials server-side, and never execute scanned code with access to host
secrets or the network.

This initial scaffold does not yet implement authentication, GitHub access,
scan isolation, or result storage. The documented scan limits and exclusions
are not enforced yet. These controls must be implemented and tested before
enabling repository scans for users.
