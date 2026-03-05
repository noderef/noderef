# Skill: node_get
## Purpose
Fetch metadata for a single repository node by ID.
Use this to verify node properties before or after mutations.

## When to use
- User asks for metadata, type, path, dates, or properties of one node.
- You need canonical node facts before update/move/copy/delete.

## When NOT to use
- Reading file text/binary content (use `node_get_content`).
- Listing folder children (use `node_list_children`).

## Inputs
- `nodeId` (required): target node UUID.

## Output reading rules (critical)
- Primary fields: `id`, `name`, `nodeType`, `isFolder`, `isFile`, `path`, `mimeType`.
- `properties` can be large; reference only returned values.
- `allowableOperations` indicates available operations for this node.

## Examples
```json
{"nodeId":"<nodeId>"}
```

```json
{"nodeId":"<fileNodeId>"}
```

```json
{"nodeId":"<folderNodeId>"}
```
