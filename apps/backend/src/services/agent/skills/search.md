# Skill: search
## Purpose
Query the repository with AFTS or keyword mode and return paged matches.
Use this tool for global counts, filtered listings, and field projection.

## When to use
- Count folders/files or other query matches.
- List nodes by query, path, type, name pattern, or content terms.
- Retrieve specific fields with `returnFields`.

## When NOT to use
- Reading file text body from a known node ID (use `node_get_content`).
- Listing direct children of a known folder (use `node_list_children`).
- Writing/creating/updating/deleting content (use node/text-write tools).

## Inputs
- `query` (required): AFTS query string.
- `language` (default `text`): `afts` or `text`.
- `maxItems` (default `20`, cap `200`): per-page sample size.
- `skipCount` (default `0`): pagination offset for manual paging.
- `collectAllPages` (default `false`): fetch pages until done or capped.
- `maxTotalItems` (default `2000`, cap `5000`): safety cap when collecting all pages.
- `returnFields` (optional, max 20): projected field paths like `name`, `properties.cm:title`.
- `includeProperties` (default `false`): include properties; auto-enabled when `returnFields` asks for properties.

## Output reading rules (critical)
- Use `pagination.totalCount` as the true repository total.
- Never use `sample.length` to answer total count questions.
- `sample` is a preview of returned items only.
- For full listings, either:
  - set `collectAllPages=true`, or
  - paginate manually with `skipCount` until `pagination.hasMoreItems=false`.
- If `returnFields` is used, answer from `projectedItems` values only.
- `verifiedNames` and `uniqueVerifiedNames` are convenience lists derived from returned items.
- If `collection.hitLimit=true`, report that output is truncated by `maxTotalItems`.

## Examples
```json
{"query":"TYPE:\"cm:folder\"","language":"afts","maxItems":1}
```

```json
{"query":"@cm:name:\"budget*\"","language":"afts","collectAllPages":true,"maxItems":200,"maxTotalItems":3000,"returnFields":["id","name","properties.cm:title"]}
```

```json
{"query":"PATH:\"/app:company_home/cm:Shared//*\"","language":"afts","maxItems":100,"skipCount":0}
```
