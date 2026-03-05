# Skill: text_write_append
## Purpose
Append one chunk to an active buffered write session.
Repeat until all text is uploaded.

## When to use
- After `text_write_begin` to stream large text in ordered chunks.
- When integrity controls (`seq`, `chunkHash`) are needed.

## When NOT to use
- Starting sessions (use `text_write_begin`).
- Finalizing writes (use `text_write_commit`).

## Inputs
- `sessionId` (required): session from `text_write_begin`.
- `chunk` (required): text chunk.
- `seq` (optional): expected sequence number guard.
- `chunkHash` (optional): sha256 hex for chunk integrity.

## Output reading rules (critical)
- Read `chunks.received` and `chunks.totalBytes` to confirm progress.
- If append fails, do not assume partial success; check `text_write_status`.
- Keep appends ordered for deterministic output.

## Examples
```json
{"sessionId":"<session>","chunk":"id,name\n"}
```

```json
{"sessionId":"<session>","chunk":"1,Alice\n2,Bob\n","seq":2}
```

```json
{"sessionId":"<session>","chunk":"<xml>...</xml>","chunkHash":"<sha256hex>"}
```
