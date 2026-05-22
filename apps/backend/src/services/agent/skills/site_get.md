# site_get

- Returns one site (`GET /sites/{siteId}`) and its containers (`GET /sites/{siteId}/containers`).
- Set `includeMembers: true` to also fetch the first page of people memberships (`GET /sites/{siteId}/members`); tune with `membersSkipCount` / `membersMaxItems`.
- Use `site_list` to discover `siteId` (short name) if unknown.
