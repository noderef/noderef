# Skill: script_create
## Purpose
Generate JavaScript Console code for the user, without executing it.
Use this to provide script drafts in chat with minimal API hallucination risk.

## How it works
- Routes the request to relevant curated helper libraries.
- Builds generation prompt with only selected minified library examples.
- Returns generated JavaScript and selected library names.

## When to use
- User asks to create/write/generate a JavaScript Console script.
- User asks for a script template, draft, snippet, or full script.

## When NOT to use
- User explicitly asks to run/execute a script on the server: use `script_execute`.
- Tasks that can be completed directly with `search`, `node_*`, or `text_write_*` tools.

## Inputs
- `request` (required): target behavior for the script.
- `selection` (optional): existing selected code to modify.
- `context` (optional): extra script context, constraints, or error details.

## Output reading rules
- `type` indicates patch intent (`replace_selection` or `replace_file`).
- `script` contains generated JavaScript source.
- `selectedLibraries` lists helper libraries used for grounded generation.

## Example
```json
{
  "request": "Maak een script dat in een site alle PDF-bestanden telt en het totaal logt."
}
```
