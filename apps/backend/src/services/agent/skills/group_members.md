# Skill: group_members
## Purpose
Add and/or remove members from an Alfresco group.

## When to use
- Add users to a group.
- Add sub-groups to a parent group.
- Remove existing members from a group.

## When NOT to use
- Read-only group inspection (use `group_get`).
- User profile lookup (use `people_get`).

## Inputs
- `groupId` (required): target group id (`GROUP_` prefix auto-added if missing).
- `add` (optional): array of `{id, memberType}` entries.
- `remove` (optional): array of member IDs to remove.

## Output reading rules (critical)
- `added` and `removed` summarize successful operations.
- `finalMemberCount` is read back after updates.
- Requires confirmation phrase `CONFIRM`.

## Examples
```json
{"groupId":"site_project_SiteManager","add":[{"id":"jdoe","memberType":"PERSON"}]}
```

```json
{"groupId":"GROUP_ALFRESCO_ADMINISTRATORS","remove":["jdoe"]}
```
