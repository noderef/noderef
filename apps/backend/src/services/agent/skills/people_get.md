# Skill: people_get
## Purpose
Fetch detailed profile information for one Alfresco user.

## When to use
- User asks for details about a specific username.
- You need account status/capabilities for one person.

## When NOT to use
- Listing many users (use `people_list`).
- Group membership operations (use `group_get` / `group_members`).

## Inputs
- `personId` (required): username/person id.

## Output reading rules (critical)
- `enabled` indicates whether login is active.
- `capabilities` includes admin/guest/mutable flags.
- `company`, `quota`, `quotaUsed` may be null if not configured.

## Examples
```json
{"personId":"admin"}
```
