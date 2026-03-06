# Skill: node_versions
## Purpose
List version history for a document node with pagination and metadata.

## When to use
- User asks for document version history.
- You need to identify who modified a file and when.
- You need total version count and paging through versions.

## When NOT to use
- Reading current live content (use `node_get_content`).
- General node metadata only (use `node_get`).

## Inputs
- `nodeId` (required): target node UUID.
- `maxItems` (optional, default 25, max 100): versions page size.
- `skipCount` (optional, default 0): paging offset.

## Output reading rules (critical)
- Use `pagination.totalCount` for true version total.
- `versions` is page data; continue with `nextSkipCount` if needed.
- `id` in each version is the version label.

## Examples
```json
{"nodeId":"<nodeId>","maxItems":25,"skipCount":0}
```
