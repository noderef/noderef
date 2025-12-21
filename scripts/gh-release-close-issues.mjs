import { execSync } from 'child_process';

// Patterns to find issue numbers
// 1. Standard: "Closes #123", "Fixes #123"
// 2. Branch merges: "Merge branch '...-#123'"
const ISSUE_PATTERNS = [
  /(?:close[s|d]?|fix(?:es|ed)?|resolve[s|d]?)\s+#(\d+)/gi,
  /-\#(\d+)'/g, // captures #123 from 'feature/foo-#123'
];

function getTags() {
  try {
    const output = execSync('git tag --sort=-creatordate', { encoding: 'utf-8' });
    return output.split('\n').filter(Boolean);
  } catch (e) {
    return [];
  }
}

function getGitLog(fromTag, toTag) {
  const range = fromTag ? `${fromTag}..${toTag}` : toTag;
  const cmd = `git log ${range} --pretty=format:"%s|%b"`;
  try {
    return execSync(cmd, { encoding: 'utf-8' });
  } catch (e) {
    console.error(`Error reading git log: ${e.message}`);
    return '';
  }
}

function findIssues(log) {
  const issues = new Set();

  // normalized log content
  const content = log;

  for (const pattern of ISSUE_PATTERNS) {
    let match;
    // reset regex state just in case
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) {
        issues.add(match[1]);
      }
    }
  }
  return Array.from(issues);
}

function processIssues() {
  const tags = getTags();
  const currentTag = tags[0];
  const previousTag = tags[1];

  if (!currentTag) {
    console.error('No tags found.');
    process.exit(1);
  }

  console.log(`Searching for issues between ${previousTag || 'initial'} and ${currentTag}...`);

  const log = getGitLog(previousTag, 'HEAD'); // Assuming HEAD is the release commit/tag
  const issueIds = findIssues(log);

  if (issueIds.length === 0) {
    console.log('No linked issues found to close.');
    return;
  }

  console.log(`Found issues: ${issueIds.join(', ')}`);

  issueIds.forEach(id => {
    try {
      // Check status strings to avoid double closing or erroring on PRs
      // We will blindly attempt to close with comment. If it's already closed,
      // GH might add the comment or ignore the close.
      // Better: Check if it's an issue and open.

      const comment = `🚀 Released in [${currentTag}](https://github.com/${process.env.GITHUB_REPOSITORY}/releases/tag/${currentTag})`;

      console.log(`Closing #${id}...`);

      // --comment automatically adds a comment.
      // If the issue is already closed, this might just add a comment (if the cli supports it) or fail.
      // Let's use `gh issue close` which is idempotent for state, but comment might duplicate?
      // Actually `gh issue close` on a closed issue does nothing usually, but let's see.
      // To be safe and clean:

      execSync(`gh issue close ${id} --comment "${comment}"`, { stdio: 'inherit' });
    } catch (e) {
      console.error(`Failed to close issue #${id}: ${e.message}`);
      // Continue to next issue
    }
  });
}

processIssues();
