# Skill: node_move
## Purpose
Move a node from its current parent to another folder.
Use when relocating existing content.

## When to use
- User asks to move a file/folder to another folder.
- Organizing repository structure.

## When NOT to use
- Duplicating content (use `node_copy`).
- Metadata/content edits (use update tools).

## Inputs
- `sourceNodeId` (required): node to move.
- `targetParentId` (required): destination folder.

## Output reading rules (critical)
- Read `moved.id`, `moved.name`, and `moved.path` for final location.
- Confirm both source and target IDs are explicit before calling.

## Examples
```json
{"sourceNodeId":"<nodeId>","targetParentId":"<folderId>"}
```

```json
{"sourceNodeId":"<docId>","targetParentId":"<archiveFolderId>"}
```

```json
{"sourceNodeId":"<folderNodeId>","targetParentId":"<destinationFolderId>"}
```

Confirmation:
- Requires explicit confirmation phrase `CONFIRM`.
