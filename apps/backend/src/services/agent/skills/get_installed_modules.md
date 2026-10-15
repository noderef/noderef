# get_installed_modules

- Calls `GET /alfresco/api/discovery` on the Alfresco server selected in the chat.
- Use for questions like "which modules are installed" or "which version of module X".
- Returns repository `edition`, `version` (display), and each module's `id`, `title`, `description`, `version`, `installState`, `installDate`.
- Missing fields are omitted. Modules without an `id` are dropped.
- If the payload has no usable modules, the result message is `no module information available`.
- 403/404/501, discovery disabled, or old ACS: report that discovery is unavailable — do not retry.
