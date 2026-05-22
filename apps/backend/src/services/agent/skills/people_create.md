# people_create

- Creates a person (`POST /people`). Requires confirmation; passwords are sensitive.
- Required: `id` (username), `firstName`, `email`, `password`. Optional `lastName`, `enabled`, `company` object, etc.
- After create, verify with `people_get`.
