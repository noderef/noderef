# Skill: text_write_abort
## Purpose
Cancel an active buffered write session.
Use to stop work and discard or retain buffered content.

## When to use
- User cancels a long write operation.
- Session state is invalid and should be reset.

## When NOT to use
- Completing writes (use `text_write_commit`).
- Routine progress checks (use `text_write_status`).

## Inputs
- `sessionId` (required): session to abort.
- `deleteBufferedContent` (default `true`): remove local buffered text file.

## Output reading rules (critical)
- Confirm `status` changed to aborted/cancelled state.
- `chunks` remains useful for audit/debug context.

## Examples
```json
{"sessionId":"<session>"}
```

```json
{"sessionId":"<session>","deleteBufferedContent":true}
```

```json
{"sessionId":"<session>","deleteBufferedContent":false}
```
