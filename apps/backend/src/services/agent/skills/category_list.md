# category_list

- `node_links`: category assignments on a node (`GET /nodes/{nodeId}/category-links`).
- `category`: fetch one category (`GET /categories/{categoryId}`).
- `subcategories`: children under a parent category id (`GET /categories/{categoryId}/subcategories`). Use `-root-` as `categoryId` for top-level taxonomy when supported.
