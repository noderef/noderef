# Skill: text_write_status
## Purpose
Inspect current state of a buffered write session.
Use this for recovery and progress checks.

## When to use
- Verify whether session is active, committed, aborted, or expired.
- Confirm chunk counters before commit or after failures.

## When NOT to use
- Uploading chunks (`text_write_append`) or committing (`text_write_commit`).

## Inputs
- `sessionId` (required): buffered write session ID.

## Output reading rules (critical)
- `session.status` drives next action (`active`, `committed`, `aborted`, etc.).
- `session.chunks` is the source of truth for received chunks and bytes.
- If `session.result` exists, it contains commit result metadata.

## Examples
```json
{"sessionId":"<session>"}
```

```json
{"sessionId":"<session-after-error>"}
```

```json
{"sessionId":"<session-before-commit>"}
```
