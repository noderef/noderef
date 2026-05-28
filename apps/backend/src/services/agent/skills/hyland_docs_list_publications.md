# Skill: hyland_docs_list_publications

## Purpose
Translate the user's product question into the correct Hyland documentation **guide** (publication) before searching topics. The Alfresco portal lists dozens of separate guides (ACS, ADW, APS, Search Services, connectors, Transform Service, modules, …).

## When to use (do this first for product docs)
- User names a product, connector, or Hyland guide not already narrowed to a single `mapId`.
- Topic search returned hits from the wrong guide or zero useful hits.
- You need `mapId` for `hyland_docs_search`.

## When NOT to use
- You already have `mapId` from a prior search result.
- Repository nodes/folders (use `search`, `node_get`, …).

## Recommended flow
1. **list_publications** — `query` = product/guide name from the user (not Solr config keywords).
2. **search** — `mapId` from the best row + `query` = topic keywords from the user.
3. **get_topic** — full markdown for 1–2 hits.

## Inputs
- `query` (recommended): e.g. `"Content Services"`, `"Digital Workspace"`, `"Search Services"`, `"Transform Service"`, `"Azure connector"`. Acronyms like `ACS` / `ADW` work via synonyms.
- `scope` (optional): `alfresco_portal` (default) or `all`.
- `version` (optional): e.g. `26.1` when the user names a release.
- `maxResults` (optional): 1–25, default 12.

## Output
- `publications[]`: `{ mapId, title, version, prettyUrl }` ranked by relevance when `query` is set.
- `hint`: follow when matches are weak or empty.
- `totalInScope`: how many guides exist in the scope (browse context).

## Examples
```json
{"query":"Alfresco Content Services","version":"26.1","maxResults":5}
```

```json
{"query":"Digital Workspace","version":"4.0"}
```

```json
{"query":"Search Services Solr"}
```
