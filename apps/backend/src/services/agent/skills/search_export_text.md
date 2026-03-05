# Skill: search_export_text
## Purpose
Run repository search and write the rendered results to a repository text file.
Prefer this for large exports because generation and upload happen server-side.

## When to use
- Export many rows to `csv`, `tsv`, `jsonl`, `markdown`, `xml`, `plain`, or `custom` text.
- Save a report to an existing node (`nodeId`) or create a new file (`parentId` + `fileName`).
- Avoid huge inline payloads in normal `search` results.

## When NOT to use
- Quick in-chat previews of a small result set (use `search`).
- Arbitrary non-search text writing workflows (use `text_write_*`).

## Inputs
- `query` (default `TYPE:"cm:content"`): AFTS filter query.
- `format` (default `csv`): `csv|tsv|jsonl|markdown|xml|plain|custom`.
- `columns` (default `["id","name","modifiedAt","content.mimeType"]`, max 40).
- `includeHeader` (default `true`): applies to tabular/plain outputs.
- `rowTemplate`: required for custom output when template control is needed.
- `prefix` / `suffix`: optional wrapper text.
- Destination:
  - update existing: `nodeId`
  - create new: `parentId` + optional `fileName`
- Paging controls:
  - `pageSize` (default `200`, cap `500`)
  - `maxTotalItems` (default `5000`, cap `20000`)
- `includeFolders` (default `false`): include folder nodes.
- Write options: `autoRename` (default `true`), `majorVersion`, `comment`.

## Output reading rules (critical)
- `created` is the final node summary of the output file.
- `export.totalRows` is written row count; `export.repositoryTotal` is total query matches.
- If `export.hitLimit=true`, output is truncated by `maxTotalItems`.
- Use `destinationNodeId` and `destinationParentId` for follow-up operations.

## Examples
```json
{"query":"TYPE:\"cm:content\"","format":"csv","columns":["id","name","modifiedAt"],"parentId":"<folderId>","fileName":"content-report.csv"}
```

```json
{"query":"TEXT:\"invoice\"","format":"markdown","columns":["name","path.name"],"maxTotalItems":10000}
```

```json
{"query":"TYPE:\"cm:content\"","format":"custom","rowTemplate":"{{id}}|{{name}}|{{properties.cm:title}}","nodeId":"<existingFileId>"}
```
