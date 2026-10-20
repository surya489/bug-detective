# Architecture

- `apps/web` contains the Next.js dashboard and its API route handlers.
- `services/analyzer` contains the Python analyzer service.
- `packages/shared-types` contains TypeScript types shared by workspace packages.
- `fixtures` contains sample repositories used to validate analyzer behavior.

The HTTP routes are scaffolded, but application-specific GitHub, scan storage,
analysis, and AI provider behavior still needs to be implemented.
