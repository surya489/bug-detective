# Architecture

- `apps/web` contains the Next.js dashboard and its API route handlers.
- `services/analyzer` contains the Python analyzer service.
- `packages/shared-types` contains TypeScript types shared by workspace packages.
- `fixtures` contains the two explicitly allowlisted local test applications.

FastAPI's `/analyze` route accepts a fixture ID, discovers source with bounded
filesystem traversal, stages eligible files in a temporary directory, and
invokes the locked workspace TypeScript compiler through an adapter. The Next
dashboard accesses the analyzer only through same-origin proxy routes.

The deterministic analyzer is intentionally limited: it does not install
target dependencies, resolve imports, execute repository code, persist scans,
or analyze arbitrary client-provided paths. GitHub access, additional
analyzers, and AI explanations remain future work.
