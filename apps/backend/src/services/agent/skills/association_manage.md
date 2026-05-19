# association_manage

- `add_peer` / `remove_peer`: `assocType` is the association QName; `targetId` is the other node id.
- `add_secondary` / `remove_secondary`: `targetId` is the child node id; `assocType` required for add.
- Requires confirmation; wrong QName can corrupt associations—verify with `association_list` first.
