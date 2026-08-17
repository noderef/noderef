This release makes the **Node Browser**, **System** tree, and **Agent** more reliable for everyday Alfresco admin work. 🔧

You can now **refresh** the current Node Browser tab from the page actions. The **System** tree no longer depends on SOLR: it resolves `/sys:system` through the repository Nodes API, so it still loads when search is down.

**Agent** markdown http(s) links now open in your system browser instead of inside the app. Claude **Opus 4.7+** models no longer send a temperature parameter, which those models reject.

We also restored copy and paste in the **Users and Groups** dialog on desktop.
