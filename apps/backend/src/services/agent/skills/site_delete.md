# site_delete

- Deletes a site (`DELETE /sites/{siteId}`). Requires confirmation.
- `permanent` is forwarded when the server supports hard-delete semantics.
- Destructive: prefer listing impact with `site_get` first.
