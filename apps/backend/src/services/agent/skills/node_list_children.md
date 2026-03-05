# Skill: node_list_children
## Purpose
List direct children of a folder.
Use for folder inventory and quick breakdowns.

## When to use
- User asks what is inside a folder.
- Need direct child IDs before follow-up read/mutate actions.

## When NOT to use
- Global repository search (use `search`).
- Recursive traversal in one call (tool lists one level).

## Inputs
- `nodeId` (required): folder node UUID.
- `maxItems` (default `20`, cap `200`): returned sample size.

## Output reading rules (critical)
- `pagination.totalCount` is the true number of direct children.
- `sample` is a page preview, not full listing if total exceeds returned count.
- `breakdown.files` and `breakdown.folders` apply to returned sample.
- Use `extensions` as a top sampled distribution, not full folder truth unless fully retrieved.

## Examples
```json
{"nodeId":"<folderId>"}
```

```json
{"nodeId":"<folderId>","maxItems":200}
```

```json
{"nodeId":"<folderId>","maxItems":1}
```
