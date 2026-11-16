This release adds the **noderef** command, so you can use NodeRef from your terminal. 🚀

List your saved servers, run JavaScript on a server, and fetch or save the scripts in **Data Dictionary/Scripts**. Saving a script keeps the old content in its version history. You only name a server; your passwords stay in NodeRef. That makes it handy for your own scripts, or to let an AI tool work with your servers. Point those tools at a test server, not production.

The **Windows installer** adds noderef to your PATH, so it works in any new terminal. On Linux, the **.deb** package now installs noderef as the command line tool. On macOS, open **Settings → About** and click **Install command**. See [docs/cli.md](https://github.com/noderef/noderef/blob/main/docs/cli.md) for all commands.

When a login to Alfresco failed, the backend log could contain the **password** and **Authorization header** of that request. NodeRef now removes credentials from everything it logs.