# Buggy fixture

Expected deterministic diagnostics from the pinned TypeScript compiler:

- `src/App.tsx`: `TS2322`, the numeric `pageTitle` does not satisfy `string`.
- `src/App.tsx`: `TS6133`, `unusedCounter` is declared but never read.

The fixture is never installed or executed. Only the isolated source files are
passed to the static TypeScript compiler.
