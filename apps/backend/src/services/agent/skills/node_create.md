# Skill: node_create
## Purpose
Create a new node in a parent folder with optional properties and initial text content.
Supports files and folders via `nodeType`.

## When to use
- Create a file or folder under a known parent.
- Create file and seed initial text in one action.

## When NOT to use
- Updating existing node metadata/content (use `node_update` / `node_update_content`).
- Moving/copying existing nodes (use `node_move` / `node_copy`).

## Inputs
- `parentId` (required): destination folder.
- `name` (required): node name.
- `nodeType` (default `cm:content`): set `cm:folder` for folders.
- `properties` (optional): metadata map.
- `autoRename` (default `false`): collision handling.
- `content` (optional): string/object/array serialized to text for file nodes.

## Output reading rules (critical)
- `created` is the final node summary.
- `contentUpdated` indicates whether content write step ran.
- For create+content flow, confirm final metadata from returned `created` object.

## Examples
```json
{"parentId":"<folderId>","name":"notes.txt","content":"hello"}
```

```json
{"parentId":"<folderId>","name":"Legal","nodeType":"cm:folder"}
```

```json
{"parentId":"<folderId>","name":"report.md","properties":{"cm:title":"Q1 Report"},"autoRename":true}
```

Confirmation:
- Requires explicit confirmation phrase `CONFIRM`.
