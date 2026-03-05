# Skill: text_write_begin
## Purpose
Start a buffered text-writing session for large payloads.
Use with `text_write_append` and `text_write_commit`.

## When to use
- Writing large text that should not be sent in one request.
- Preparing a controlled multi-step write to new or existing file.

## When NOT to use
- Small content updates that fit safely in one `node_update_content` call.
- Search-driven exports (prefer `search_export_text`).

## Inputs
- Target selection:
  - `nodeId` to update an existing file.
  - or `parentId` + `fileName` to create on commit.
- Optional metadata: `mimeType`, `encoding` (default utf-8).
- Session controls:
  - `maxChunkBytes` (default `32768`, cap `262144`)
  - `ttlMinutes` (default `120`, min `5`, max `1440`)
  - `autoRename` (default `true` for create mode)
- Optional commit defaults: `majorVersion`, `comment`, `renameOnCommit`.

## Output reading rules (critical)
- Persist `session.sessionId`; all follow-up calls require it.
- `session.chunks` starts counters used to track append progress.
- Respect `session.expiresAt`; expired sessions must be restarted.

## Examples
```json
{"parentId":"<folderId>","fileName":"report.csv","mimeType":"text/csv"}
```

```json
{"nodeId":"<fileId>","encoding":"utf-8","ttlMinutes":240}
```

```json
{"parentId":"<folderId>","fileName":"large.xml","maxChunkBytes":131072,"autoRename":true}
```
