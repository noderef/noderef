# people_update

- Updates a person (`PUT /people/{personId}`). Requires confirmation.
- Include only fields to change. For password changes, supply `password` and `oldPassword` when the repository policy requires it.
- Disabling accounts: set `enabled: false`.
- This is a REST call, not an admin-only tool. Non-admin users can typically update only their own profile; updating another person or enabling/disabling accounts usually returns 403 — explain that limitation, do not retry.
