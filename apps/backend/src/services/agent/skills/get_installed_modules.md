# get_installed_modules

- Calls `GET /alfresco/api/discovery` on the Alfresco server selected in the chat.
- Use for questions like "which modules are installed" or "which version of module X".
- Returns repository `edition`, `version` (display), and each module's `id`, `title`, `description`, `version`, `installState`, `installDate`.
- Include every module returned in `modules`, regardless of `installState`. `INSTALLED`, `UNKNOWN`, other values, and missing states all belong in the same module list.
- For a module overview, show the complete list in one table with module name/id and version, plus installation date when available. Do not replace part of the list with a count, examples, or a summary. Only narrow the list when the user explicitly asks for a subset or a specific module.
- `installState` is informational metadata, not an inclusion or verification criterion. Do not split the list by state, label `UNKNOWN` modules as unconfirmed or absent, or add warnings or verification steps based solely on state. Omit the state column unless the user asks for it.
- Missing fields are omitted. Modules without an `id` are dropped.
- If the payload has no usable modules, the result message is `no module information available`.
- 403/404/501, discovery disabled, or old ACS: report that discovery is unavailable — do not retry.
