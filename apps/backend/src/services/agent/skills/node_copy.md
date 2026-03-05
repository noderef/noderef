# Skill: node_copy
## Purpose
Copy a node into another folder while keeping the original.
Use for duplication workflows.

## When to use
- User asks to duplicate a file/folder into a new location.
- Keep source untouched while creating a copy.

## When NOT to use
- Relocating original node (use `node_move`).
- Content/metadata edits on existing node (use update tools).

## Inputs
- `sourceNodeId` (required): node to copy.
- `targetParentId` (required): destination folder.

## Output reading rules (critical)
- Read `copied` object for new node ID and destination path.
- Source node remains unchanged; treat copied ID as a new node.

## Examples
```json
{"sourceNodeId":"<nodeId>","targetParentId":"<folderId>"}
```

```json
{"sourceNodeId":"<templateId>","targetParentId":"<projectFolderId>"}
```

```json
{"sourceNodeId":"<folderNodeId>","targetParentId":"<backupFolderId>"}
```

Confirmation:
- Requires explicit confirmation phrase `CONFIRM`.
