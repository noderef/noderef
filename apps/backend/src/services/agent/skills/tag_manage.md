# tag_manage

- `add_to_node`: POST tag text on a node (`nodeId`, `tag`).
- `remove_from_node`: DELETE by `nodeId` + `tagId`.
- `rename_global`: PUT new label on a tag id (`tagId`, `tag` = new name).
- `delete_global`: DELETE repository tag by `tagId` (affects all usages). Requires confirmation.
