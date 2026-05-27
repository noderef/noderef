# Skill: hyland_docs_get_topic

## Purpose
Load a single Hyland documentation topic as markdown after `hyland_docs_search` identified mapId and contentId.

## When to use
- After `hyland_docs_search` returned relevant hits.

## Inputs
- `mapId`, `contentId` (required).
- `mapTitle`, `title`, `breadcrumb`, `readerUrl` (from the search hit — required for citations in your answer).
- `maxChars` (optional).

## Output
- Use returned `mapTitle`, `title`, `breadcrumb`, `readerUrl` when citing the doc.
- If `truncated=true`, say the page was truncated.
