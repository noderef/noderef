# NodeRef CLI

`cli/noderef.mjs` drives a running NodeRef from the terminal. Shell scripts and AI coding tools (Claude Code and similar) can run actions on your Alfresco servers by naming a server that is saved in NodeRef. The NodeRef backend authenticates with the credentials it already stores, so the caller never handles a username or password.

- [Requirements](#requirements)
- [Installation](#installation)
- [Commands](#commands)
- [Selecting servers and scripts](#selecting-servers-and-scripts)
- [Connecting to the backend](#connecting-to-the-backend)
- [Using it from an AI coding tool](#using-it-from-an-ai-coding-tool)
- [Security notes](#security-notes)
- [Troubleshooting](#troubleshooting)

## Requirements

- Node.js 18 or newer. The CLI has no dependencies.
- A running NodeRef (desktop app or dev mode) with at least one saved server.
- For `js` and `scripts`: the JavaScript Console endpoint configured on that server in NodeRef, which needs the [OOTBee Support Tools](https://github.com/OrderOfTheBee/ootbee-support-tools) module on the Alfresco side.

## Installation

Run it straight from a checkout:

```bash
node cli/noderef.mjs help
pnpm cli help            # same thing through the workspace script
```

For a global `noderef` command, link the repository once:

```bash
npm link                 # in the repository root
noderef help
```

The examples below use the `noderef` form.

## Commands

Every command exits with `0` on success and `1` on failure. Errors go to stderr.

### `noderef servers [--json]`

Lists the servers saved in NodeRef.

```text
ID  NAME        LABEL  AUTH   URL
1   Local test  TEST   basic  http://localhost:8080/alfresco
```

`--json` prints the full server records. Credentials are never part of the output; a record only says whether credentials are stored (`hasCredentials`).

### `noderef js <server> [file] [-e <code>] [--saved <script>] [--doc <nodeRef>] [--json]`

Runs JavaScript in the server's JavaScript Console, as the account saved for that server.

The script comes from exactly one source:

| Source             | Example                                         |
| ------------------ | ----------------------------------------------- |
| Inline code        | `noderef js TEST -e 'print(companyhome.name)'`  |
| A local file       | `noderef js TEST ./cleanup.js`                  |
| Standard input     | `cat cleanup.js \| noderef js TEST`             |
| A stored script    | `noderef js TEST --saved cleanup.js`            |

Options:

- `--doc <nodeRef>` sets the console's `document` variable to that node.
- `--json` prints the complete console result (`printOutput`, `result`, `scriptPerf`, `spaceNodeRef`, ...) instead of only the `print()` lines.

Behaviour:

- Each `print()` call becomes one line on stdout.
- When the script fails, the CLI prints the error message on stderr and exits with `1`. The Java stack trace is left out; use `--json` to see it.
- The script runs in a read-write transaction, the same as in the NodeRef JavaScript Console.
- Long-running scripts are supported: the CLI polls until the script finishes.
- Line numbers in error messages are offset, because the console puts its own lines in front of your script. In `Javascript Console Script#43` with a 42-line prefix, the error is on line 1 of your script.

### `noderef scripts list <server> [--json]`

Lists the `.js` files stored in the repository under `Data Dictionary/Scripts`.

```text
NODE ID                               NAME        SIZE  MODIFIED
240c2e26-5585-4855-8c2e-2655857855e5  cleanup.js  1490  2026-11-16T15:29:26.264Z
```

The list comes from the search index, so a script created a moment ago can take a few seconds to appear.

### `noderef scripts get <server> <script>`

Prints the content of a stored script on stdout.

```bash
noderef scripts get TEST cleanup.js > cleanup.js
```

### `noderef scripts save <server> <script> [file] [-m <comment>]`

Saves new content to an existing stored script, from a file or from standard input, and reports the version it created.

```bash
noderef scripts save TEST cleanup.js ./cleanup.js -m "Fix date filter"
# Saved cleanup.js as version 1.1 on TEST.
```

- Every save creates a new minor version (1.1, 1.2, ...).
- If the script is not versionable yet, it is made versionable first. The content being replaced becomes version 1.0, so it is never lost.
- `-m` sets the version comment. Without it the comment is `Saved with the NodeRef CLI`.
- The script must already exist. To create a new one, use a `js` script that creates the file in `Data Dictionary/Scripts`.
- Saving as a version needs a NodeRef backend that supports it. Against an older backend the content is still written, but the CLI exits with an error saying no version was created.

### `noderef rpc <method> [json-params]`

Calls a backend RPC method directly and prints the JSON result. This is the escape hatch for anything the other commands do not cover.

```bash
noderef rpc backend.servers.list
noderef rpc backend.jsconsole.getHistory '{"serverId":1,"limit":5}'
```

See [Security notes](#security-notes) before giving an automated tool access to this command.

## Selecting servers and scripts

`<server>` accepts:

1. a server id from `noderef servers`, or
2. a case-insensitive part of the server's name, label, or URL, as long as it matches exactly one server (for example `localhost` or `TEST`).

`<script>` accepts:

1. a node id from `noderef scripts list`,
2. the exact file name (case-insensitive), or
3. a part of the file name, as long as it matches exactly one script.

When a reference matches nothing or more than one item, the CLI lists the candidates and exits with `1`.

## Connecting to the backend

The CLI finds the running backend through the files NodeRef writes to its data directory on startup:

| File                          | Purpose                                             |
| ----------------------------- | --------------------------------------------------- |
| `.runtime/backend-port`       | Port the backend listens on                         |
| `.runtime/backend-token`      | Per-launch token required on every backend request  |

The data directory is:

| Platform | Default location                                         |
| -------- | -------------------------------------------------------- |
| macOS    | `~/Library/Application Support/nl.noderef.desktop`       |
| Windows  | `%USERPROFILE%\AppData\Roaming\nl.noderef.desktop`       |
| Linux    | `~/.local/share/nl.noderef.desktop`                      |

Environment variables:

| Variable      | Effect                                                                                  |
| ------------- | --------------------------------------------------------------------------------------- |
| `DATA_DIR`    | Use a different NodeRef data directory (must match the one the backend was started with) |
| `NODEREF_URL` | Use this backend URL instead of the discovered port, for example `http://localhost:5111` |

Without a port file the CLI falls back to `http://127.0.0.1:5111`, the dev-mode default.

The launch token is only sent to loopback addresses (`127.0.0.1`, `localhost`, `::1`).

**Docker deployments.** Point `NODEREF_URL` at the container. Docker mode does not use the launch token. If the deployment is protected with `WEB_PASSWORD`, the CLI cannot authenticate and its requests are rejected.

## Using it from an AI coding tool

Tell the tool to use the CLI and which server to use, for example:

> Use `noderef js localhost` to run this script against my test repository.

A typical edit loop on a stored script:

```bash
noderef scripts get TEST cleanup.js > cleanup.js     # fetch the current version
# ... edit cleanup.js ...
noderef js TEST ./cleanup.js                         # try it out
noderef scripts save TEST cleanup.js ./cleanup.js -m "Describe the change"
```

## Security notes

- **Credentials stay in NodeRef.** No command prints or returns stored usernames, passwords, or tokens.
- **Scripts run with the saved account's rights.** For most saved servers that is an admin account, and scripts run in a read-write transaction. Point automated tools at a test server, not production.
- **Access is limited to your OS user.** The desktop backend only accepts requests that carry the launch token, and on macOS and Linux the token file is readable by your user account only. Any process running as you, including an AI tool with shell access, can read it.
- **`rpc` is unrestricted.** It can call every backend method, including ones that change saved server settings such as a server's URL. Only allow it for tools you trust with that.
- **Backend logs can contain credentials.** When a login to Alfresco fails, the backend currently logs the failed request including its credentials. Keep NodeRef's log files out of reach of tools that should not see them.

## Troubleshooting

| Message                                                    | Cause and fix                                                                                                             |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `Cannot reach NodeRef at ...`                               | NodeRef is not running, or it uses another data directory. Start it, or set `DATA_DIR` / `NODEREF_URL`.                   |
| `... failed (HTTP 401): Invalid or missing launch token.`   | The CLI read a token from a different data directory than the running backend uses. Set `DATA_DIR` to the backend's.      |
| `No server matches "..."`                                   | Check `noderef servers` and use the id.                                                                                   |
| `JavaScript Console endpoint not configured for this server` | Set the JavaScript Console endpoint in the server's settings in NodeRef.                                                  |
| `No saved script matches "..."`                             | The script is not in `Data Dictionary/Scripts`, is not a `.js` file, or is not indexed yet.                               |
| `Saved ..., but no version was created`                     | The backend is older than the CLI. Update NodeRef.                                                                        |
