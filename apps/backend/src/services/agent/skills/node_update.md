# Skill: node_update
## Purpose
Update node metadata fields such as name and properties.
Use for non-content changes.

## When to use
- Rename node.
- Update custom properties or title/description metadata.

## When NOT to use
- Replacing file text/body (use `node_update_content`).
- Creating new node (use `node_create`).

## Inputs
- `nodeId` (required): target node UUID.
- `name` (optional): new name.
- `properties` (optional): partial properties object.

## Output reading rules (critical)
- At least one of `name` or `properties` must be provided.
- Read updated values from `updated` object.
- Verify key metadata fields after update (`name`, `properties`, `path`).

## Examples
```json
{"nodeId":"<nodeId>","name":"renamed.docx"}
```

```json
{"nodeId":"<nodeId>","properties":{"cm:title":"New title"}}
```

```json
{"nodeId":"<nodeId>","name":"invoice-2026.pdf","properties":{"cm:description":"Approved"}}
```

Confirmation:
- Requires explicit confirmation phrase `CONFIRM`.
