# Project Rules

## Scope

- Keep compatibility for `.charx`, `.risum`, `.risup`, and `.risupreset`.
- Prefer repository-local TypeScript implementations over vendored upstream runtime code.
- Preserve existing input validation and path traversal protections.

## Current Design Note

- `rpack` and container codecs live in `src/formats/` as repository-local TypeScript code.
