# node_lock

- Locks a node (`POST /nodes/{nodeId}/lock`). Requires confirmation.
- If you omit lock options, a default non-blocking style lock type may be applied; prefer explicit `type` / `lifetime` / `timeToExpire` when you know the server policy.
