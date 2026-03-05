# Skill: script_execute
## Purpose
Execute JavaScript Console code on the server for tasks unsupported by standard tools.
This tool is high risk and should be used sparingly.

## When to use
- User explicitly asks to run server-side script logic.
- Required capability is unavailable in `search`, `node_*`, or `text_write_*` tools.

## When NOT to use
- Normal search/read/write/delete/move/copy operations supported by built-in tools.
- Cases where the user did not request script execution.

## Inputs
- `script` (required): JavaScript source to execute.

## Output reading rules (critical)
- Check `status` and `error` first.
- `output` contains bounded console lines for user-visible summary.
- `scriptPreview` is partial and not authoritative for full script body.

## Examples
```json
{"script":"logger.log('hello from script');"}
```

```json
{"script":"var node = search.findNode('workspace://SpacesStore/<id>'); logger.log(node ? node.name : 'missing');"}
```

```json
{"script":"var count = search.luceneSearch('TYPE:\"cm:content\"').length; logger.log('count=' + count);"}
```

Confirmation:
- Requires explicit confirmation phrase `CONFIRM` before execution.
