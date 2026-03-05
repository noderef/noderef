# Skill: node_delete
## Purpose
Delete one or more nodes with optional permanent deletion.
Default behavior moves items to trash.

## When to use
- User explicitly requests delete/removal.
- Batch deletion across known node IDs.

## When NOT to use
- Move/copy/archive operations that should preserve source.
- Cases where node IDs are uncertain.

## Inputs
- `nodeIds` (required): non-empty array of node UUIDs.
- `permanent` (default `false`):
  - `false`: move to trash
  - `true`: permanent delete

## Output reading rules (critical)
- `deleted` lists successfully deleted node IDs.
- `totalDeleted` should match intended count.
- `permanent` confirms deletion mode used.

## Examples
```json
{"nodeIds":["<id1>"]}
```

```json
{"nodeIds":["<id1>","<id2>","<id3>"],"permanent":false}
```

```json
{"nodeIds":["<id1>"],"permanent":true}
```

Confirmation:
- Requires explicit confirmation phrase `CONFIRM`.
- Deletion is destructive; default mode is trash, permanent mode bypasses trash.
