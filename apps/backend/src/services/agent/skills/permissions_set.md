# Skill: permissions_set
## Purpose
Update node ACLs by toggling inheritance and adding/removing local permissions.

## When to use
- Grant access to a user/group on a specific node.
- Revoke local ACL entries from a node.
- Enable or disable inheritance for a node.

## When NOT to use
- Inspecting current ACLs without changes (use `permissions_get`).
- Non-permission metadata updates (use `node_update`).

## Inputs
- `nodeId` (required): target node UUID.
- `isInheritanceEnabled` (optional): inheritance toggle.
- `addPermissions` (optional): array of `{authority, role}` to add.
- `removePermissions` (optional): array of `{authority, role}` to remove.

## Output reading rules (critical)
- Result includes the read-back ACL state after mutation.
- `requestedChanges` echoes intended updates.
- `localPermissions` is the effective local ACL list after apply.
- Requires confirmation phrase `CONFIRM`.

## Examples
```json
{"nodeId":"<nodeId>","addPermissions":[{"authority":"jdoe","role":"SiteCollaborator"}]}
```

```json
{"nodeId":"<nodeId>","isInheritanceEnabled":false}
```
