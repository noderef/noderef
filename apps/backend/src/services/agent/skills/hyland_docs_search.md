# Skill: hyland_docs_search

## Purpose
Search **topics** inside one Hyland documentation guide after the guide is known.

## When to use
- After `hyland_docs_list_publications` returned a `mapId`, **or**
- You pass `publication` (guide name) and the service auto-resolves the guide with high confidence.

## When NOT to use
- You only know the product name and have neither `mapId` nor `publication` — call `hyland_docs_list_publications` first.
- Repository content (use `search`, `node_get`, …).

## Required inputs
- `query` (required): topic keywords only.
- **One of** `mapId` (preferred) **or** `publication` (guide name for auto-resolve).

Global topic search without a guide is **not** supported (avoids cross-guide noise).

## Recommended flow
1. `hyland_docs_list_publications` — product/guide name (+ version).
2. `hyland_docs_search` — `mapId` + topic `query`.
3. `hyland_docs_get_topic` — pass `mapId`, `contentId`, `mapTitle`, `title`, `breadcrumb`, `readerUrl` from the hit.

## Optional inputs
- `version`, `product`, `scope`, `maxResults`.

## Examples
```json
{"query":"custom content model","mapId":"<from-list-publications>","maxResults":5}
```

```json
{"query":"SAML SSO","publication":"Alfresco Digital Workspace","version":"4.0"}
```
