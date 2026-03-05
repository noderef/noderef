# Skill: node_update_content
## Purpose
Replace file content for an existing node.
Supports version/comment options and post-write readback.

## When to use
- User asks to overwrite or rewrite file contents.
- Apply generated text to an existing file node.

## When NOT to use
- Large streaming writes needing chunking (use `text_write_*`).
- Metadata-only updates (use `node_update`).

## Inputs
- `nodeId` (required): target file node UUID.
- `content` (required): string/object/array serialized to text.
- `majorVersion` (optional): versioning hint.
- `comment` (optional): version comment.

## Output reading rules (critical)
- `updated` is a read-back node summary after content write.
- `contentChars` reports stored text size.
- `contentTransformed=true` means non-string input was serialized.

## Examples
```json
{"nodeId":"<fileId>","content":"new body"}
```

```json
{"nodeId":"<fileId>","content":{"rows":[1,2,3]},"comment":"Refresh data"}
```

```json
{"nodeId":"<fileId>","content":"# Changelog\n...","majorVersion":true}
```

Confirmation:
- Requires explicit confirmation phrase `CONFIRM`.
