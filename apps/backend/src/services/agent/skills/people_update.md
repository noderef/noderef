# people_update

- Updates a person (`PUT /people/{personId}`). Requires confirmation.
- Include only fields to change. For password changes, supply `password` and `oldPassword` when the repository policy requires it.
- Disabling accounts: set `enabled: false`.
