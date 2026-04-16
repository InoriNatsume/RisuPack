# Project Rules

## Scope

- Keep compatibility for bot('.charx', '.png', '.jpg/jpeg'), `.risum`, `.risup`, and `.risupreset`.
- Prefer repository-local TypeScript implementations over vendored upstream runtime code.
- Preserve existing input validation and path traversal protections.

## Current Design Note

- `rpack` and container codecs live in `src/formats/` as repository-local TypeScript code.
