# Skill: group_get
## Purpose
Read group metadata and optionally fetch member listings.

## When to use
- User asks for details of a specific group.
- User asks for group members and membership totals.

## When NOT to use
- Adding/removing memberships (use `group_members`).
- Listing repository users globally (use `people_list`).

## Inputs
- `groupId` (required): group id; `GROUP_` prefix is auto-added if missing.
- `includeMembers` (optional, default true): include members page.
- `maxMembers` (optional, default 50, max 200): members page size.

## Output reading rules (critical)
- `zones` identifies Alfresco zones for the group.
- `members` is paged and limited by `maxMembers`.
- Use `pagination.totalCount` as true member total.

## Examples
```json
{"groupId":"GROUP_ALFRESCO_ADMINISTRATORS"}
```

```json
{"groupId":"ALFRESCO_ADMINISTRATORS","includeMembers":true,"maxMembers":100}
```
