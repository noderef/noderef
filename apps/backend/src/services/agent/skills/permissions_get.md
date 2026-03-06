# Skill: permissions_get
## Purpose
Read a node's current ACL state, including local and inherited permissions.

## When to use
- User asks who can access a node.
- You need to inspect inheritance and local ACL overrides.
- You need available roles before proposing permission changes.

## When NOT to use
- Changing ACLs (use `permissions_set`).
- Reading general node metadata without ACL focus (use `node_get`).

## Inputs
- `nodeId` (required): target node UUID.

## Output reading rules (critical)
- `isInheritanceEnabled` shows whether parent ACL inheritance is active.
- `localPermissions` are direct ACL entries set on this node.
- `inheritedPermissions` are inherited from parent hierarchy.
- `settablePermissions` lists role names that can be assigned.

## Examples
```json
{"nodeId":"<nodeId>"}
```
