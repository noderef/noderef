# category_manage

- `create_subcategory`: `parentCategoryId` + `name` (POST `/categories/{id}/subcategories` with body array).
- `update_category` / `delete_category`: target `categoryId`.
- `link_node` / `unlink_node`: `nodeId` + `categoryId`.
- Taxonomy changes are destructive; requires confirmation.
