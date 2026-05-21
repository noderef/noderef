# Custom JavaScript Libraries (Alfresco)

NodeRef loads optional helper libraries from:

`Data Dictionary/NodeRef/js-libs/`

Each `.js` file becomes a custom AI library named `custom_<filename-without-.js>` when it starts with a top-level JSDoc block containing `@description`. `@description` and `@tags` are routed like built-in libraries from `apps/backend/src/ai/manifest.ts`.

Use the complete prompt below when generating a custom library from a JavaScript root object wrapper class. Copy the full block, replace the placeholders, and paste the Java class at the end.

## Prompt for Agent

```text
Transform this JavaScript root object class into a compact Alfresco JavaScript Console sample library for NodeRef custom libs.

Root object name: <rootObject>
Output file: <filename.js> (e.g. people-samples.js; default: repository root unless another path is specified)

Use apps/backend/src/ai/libs/people.js as the style example. The output file must start with manifest-style metadata:

/**
 * @description Create, delete and look up people; manage accounts, passwords, quotas, capabilities, and group memberships from Alfresco scripts.
 * @tags users, people, profile, accounts, auth, groups, membership, quota, admin, ldap
 */

Metadata rules:
- @description: one sentence, built-in manifest tone, list main capabilities, prefer "from Alfresco scripts"; avoid "in the JS Console".
- @tags: one comma-separated line of short routing tokens like manifest.ts; lowercase/camelCase/kebab-case; no spaces inside tags.

/**
 * Get a person node by username.
 */
function example_people_get_person() {
  var username = 'mjackson';

  if (!username) {
    logger.log('Username is empty.');
    return;
  }

  var person = people.getPerson(username);
  if (!person) {
    logger.log('No person found for username: ' + username);
    return;
  }

  logger.log('Found person: ' + person.properties['cm:userName']);
}

Output requirements:
- Write the complete JavaScript library to the output file path above. Create or overwrite the file.
- Do not only paste generated code in chat.
- The file must start with @description and @tags JSDoc as shown above.

JavaScript requirements:
- ES5 only: use var, function, and for loops.
- Do not use const, let, arrows, classes, import, export, TypeScript, Java imports, or package declarations.
- Use logger.log for output.
- Function names must be example_<rootObject>_<task>(), with snake_case task names.
- Add a short comment block above each function and defensive null/empty checks.
- Use realistic placeholders for NodeRefs, paths, names, UUIDs, URLs, and IDs.
- Add a WARNING comment before destructive or state-changing calls.
- Skip methods when arguments, behavior, or return values are unclear.
- Accuracy over coverage.

Cover when the API is clear:
- read/list/search examples
- create/update/delete examples with warnings
- helpers/factories
- useful overloads as separate examples
- one safe read-only end-to-end workflow if possible

Java class:

<paste Java source here>
```

## Notes

`<rootObject>` is the Rhino root object name, such as `people`, `search`, or `jsonUtils`. Use it exactly as provided.

The filename must contain only letters, digits, `_`, `-`, or `.` and must end in `.js` (for example, `people-samples.js`). Generate the file in the repository root unless another output path is specified, then upload it to `Data Dictionary/NodeRef/js-libs/` in Alfresco.
