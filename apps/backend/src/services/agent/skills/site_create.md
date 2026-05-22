# site_create

- Creates a site (`POST /sites`). Requires user confirmation.
- `visibility` is `PUBLIC`, `PRIVATE`, or `MODERATED` (default `PUBLIC`).
- `skipConfiguration` / `skipAddToFavorites` map to Alfresco query flags on create.
- After create, verify with `site_get`.
