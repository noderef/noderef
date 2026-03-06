# Skill: people_list
## Purpose
List users with pagination and optional server-side filtering.

## When to use
- User asks for all users or a user subset.
- You need total user count and page-wise listing.
- You need quick lookup by partial name/id filter.

## When NOT to use
- Fetching one known user profile (use `people_get`).
- Group membership inspection (use `group_get`).

## Inputs
- `filter` (optional): partial text for matching users.
- `maxItems` (optional, default 25, max 100): page size.
- `skipCount` (optional, default 0): paging offset.

## Output reading rules (critical)
- Use `pagination.totalCount` for total user count.
- `people` contains page data only, not full repository users.
- Use `pagination.nextSkipCount` when `hasMoreItems` is true.

## Examples
```json
{"maxItems":25,"skipCount":0}
```

```json
{"filter":"john","maxItems":50}
```
