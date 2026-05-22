# site_members

- Mutates person membership: `add`, `remove`, or `update` (`POST` / `DELETE` / `PUT` under `/sites/{siteId}/members/...`). Requires confirmation.
- `role` must be one of: `SiteConsumer`, `SiteCollaborator`, `SiteContributor`, `SiteManager`.
- To **list** members, use `site_get` with `includeMembers: true` (paged).
