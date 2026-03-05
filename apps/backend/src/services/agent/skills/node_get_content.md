# Skill: node_get_content
## Purpose
Read content for a node and return text when possible.
Provides metadata-only response for binary or non-text content.

## When to use
- User asks to open/read/show file contents.
- You need file body text for analysis or transformation.

## When NOT to use
- Metadata-only lookup (use `node_get`).
- Folder listing (use `node_list_children`).

## Inputs
- `nodeId` (required): file node UUID.
- `maxChars` (default `12000`, cap `100000`): returned text cap.
- `forceText` (default `false`): force UTF-8 decode even if binary heuristics trigger.

## Output reading rules (critical)
- Check `isTextBased` first:
  - `true`: use `content` and `markdownCodeBlock`.
  - `false`: content is non-text/binary; `content` is null.
- When `truncated=true`, the returned text is partial; state this clearly.
- Use `contentLanguage` for markdown fence language.
- `contentBytes` shows file byte size; `returnedChars` may be lower due to cap.

## Examples
```json
{"nodeId":"<fileId>"}
```

```json
{"nodeId":"<fileId>","maxChars":30000}
```

```json
{"nodeId":"<unknownTypeFileId>","forceText":true,"maxChars":5000}
```
