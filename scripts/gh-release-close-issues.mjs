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
      const commentLink = `[${currentTag}](https://github.com/${process.env.GITHUB_REPOSITORY}/releases/tag/${currentTag})`;
      const commentBody = `🚀 Released in ${commentLink}`;

      // Check current status
      const checkCmd = `gh issue view ${id} --json state --jq .state`;

      let state;
      try {
        state = execSync(checkCmd, { encoding: 'utf-8' }).trim();
      } catch (e) {
        console.warn(`Skipping #${id}: Unable to fetch details (might be a PR or not found)`);
        return;
      }

      if (state === 'OPEN') {
        console.log(`Closing #${id}...`);
        execSync(`gh issue close ${id} --comment "${commentBody}"`, { stdio: 'inherit' });
      } else {
        console.log(`Skipping #${id}: Issue is already closed.`);
      }
    } catch (e) {
      console.error(`Failed to process issue #${id}: ${e.message}`);
    }
  });
}

processIssues();
