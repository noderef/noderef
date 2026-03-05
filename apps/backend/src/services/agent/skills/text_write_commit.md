# Skill: text_write_commit
## Purpose
Finalize buffered text upload and write the content to the repository.
Commits either to an existing target file or creates a new file.

## When to use
- After all `text_write_append` calls are complete.
- When you need guarded finalize checks (`expectedChunks`, `expectedBytes`, `finalHash`).

## When NOT to use
- Before uploading all content chunks.
- For direct small writes (use `node_update_content`).

## Inputs
- `sessionId` (required): session to finalize.
- Integrity guards (optional): `expectedChunks`, `expectedBytes`, `finalHash`.
- Write options (optional): `majorVersion`, `comment`, `renameOnCommit`.
- `keepSession` (default `false`): keep buffered file after commit.

## Output reading rules (critical)
- Read `created` or `updated` for final node summary.
- `write.contentHash`, `write.totalBytes`, and `write.chunksReceived` confirm commit integrity.
- If commit fails, session may remain for retry depending on error state.

## Examples
```json
{"sessionId":"<session>"}
```

```json
{"sessionId":"<session>","expectedChunks":8,"expectedBytes":128442}
```

```json
{"sessionId":"<session>","finalHash":"<sha256hex>","majorVersion":true,"comment":"Generated report"}
```

Confirmation:
- Requires explicit confirmation phrase `CONFIRM` before commit.
