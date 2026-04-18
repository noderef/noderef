/**
 * Copyright 2025-2026 NodeRef
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { execSync, execFileSync } from 'child_process';

// Patterns to find issue numbers in commit messages, PR titles, and PR bodies
// These match explicit references like "Closes #123", "Fixes #123", "Resolves #123"
const ISSUE_REF_PATTERNS = [/(?:close(?:s|d)?|fix(?:es|ed)?|resolve(?:s|d)?)\s+#(\d+)/gi];

// Patterns to find issue numbers in branch names
// Matches branch naming conventions with -#123 (e.g., "fix/issue-#123" or "feature-#456")
// Note: Only matches patterns with a dash before #, not bare "#123" or "issue/#123"
const ISSUE_BRANCH_PATTERNS = [
  /-#(\d+)\b/g, // matches -#123 in branch names
];

function findIssueIdsInBranchName(branchName) {
  const issues = new Set();
  for (const pattern of ISSUE_BRANCH_PATTERNS) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(branchName)) !== null) {
      if (match[1]) {
        issues.add(match[1]);
      }
    }
  }
  return Array.from(issues);
}

function sortIssueIds(issueIds) {
  return [...issueIds].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

function closeLinkedIssues(issueIds, currentTag) {
  if (issueIds.length === 0) {
    return;
  }

  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.warn('GITHUB_REPOSITORY not set, skipping issue close');
    return;
  }

  const sorted = sortIssueIds(issueIds);
  console.log(`Closing linked issues: ${sorted.map(id => `#${id}`).join(', ')}`);

  sorted.forEach(id => {
    try {
      const commentLink = `[${currentTag}](https://github.com/${repo}/releases/tag/${currentTag})`;
      const commentBody = `🚀 Released in ${commentLink}`;

      let state;
      try {
        const stateJson = execFileSync(
          'gh',
          ['issue', 'view', id, '--json', 'state', '--jq', '.state'],
          { encoding: 'utf-8', stdio: 'pipe' }
        );
        state = stateJson.trim();
      } catch (e) {
        console.warn(`Skipping #${id}: Unable to fetch details (might be a PR or not found)`);
        return;
      }

      if (state === 'OPEN') {
        console.log(`Closing #${id}...`);
        execFileSync('gh', ['issue', 'close', id, '--comment', commentBody], { stdio: 'inherit' });
      } else {
        console.log(`Skipping #${id}: Issue is already closed.`);
      }
    } catch (e) {
      console.error(`Failed to process issue #${id}: ${e.message}`);
    }
  });
}

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
  const content = log;

  // Check commit messages for explicit issue references and merged branch names.
  // Example merge subject: "Merge branch 'feature/foo-#123' into release/x.y.z"
  for (const pattern of [...ISSUE_REF_PATTERNS, ...ISSUE_BRANCH_PATTERNS]) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      if (match[1]) {
        issues.add(match[1]);
      }
    }
  }
  return Array.from(issues);
}

function getMergedPRsInRange(previousTag, currentTag) {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) {
    console.warn('GITHUB_REPOSITORY not set, skipping PR-based issue detection');
    return [];
  }

  const [owner, repoName] = repo.split('/');
  if (!owner || !repoName) {
    console.warn(`Invalid GITHUB_REPOSITORY format: ${repo}`);
    return [];
  }

  try {
    // For initial releases (no previous tag), skip PR-based detection to avoid
    // querying potentially huge commit ranges. Commit message scanning will still work.
    if (!previousTag) {
      console.log('No previous tag found - skipping PR-based issue detection for initial release');
      return [];
    }

    // Use GitHub compare API to get commits in the release range
    // This is deterministic and works for all merge types (merge, squash, rebase)
    const base = previousTag;
    const head = currentTag;

    let compareData;
    try {
      const compareJson = execFileSync(
        'gh',
        ['api', `repos/${owner}/${repoName}/compare/${base}...${head}`],
        { encoding: 'utf-8', stdio: 'pipe' }
      );
      compareData = JSON.parse(compareJson);
    } catch (e) {
      console.warn(`Warning: Could not fetch compare data: ${e.message}`);
      return [];
    }

    if (!compareData.commits || compareData.commits.length === 0) {
      return [];
    }

    // Check if compare API truncated results (can happen for large ranges)
    if (
      typeof compareData.total_commits === 'number' &&
      compareData.total_commits !== compareData.commits.length
    ) {
      console.warn(
        `Warning: compare API returned ${compareData.commits.length}/${compareData.total_commits} commits. ` +
          `PR detection may be incomplete for large ranges.`
      );
      // Fallback: use git log to get all commit SHAs in range
      try {
        const range = `${base}..${head}`;
        const gitLogSHAs = execSync(`git log ${range} --pretty=format:"%H"`, {
          encoding: 'utf-8',
          stdio: 'pipe',
        })
          .split('\n')
          .filter(Boolean);
        console.log(`Using git log fallback: found ${gitLogSHAs.length} commits in range`);
        // Use git log SHAs instead of compare API commits
        compareData.commits = gitLogSHAs.map(sha => ({ sha }));
      } catch (e) {
        console.warn(`Warning: Could not use git log fallback: ${e.message}`);
      }
    }

    // For each commit, query which PRs it belongs to
    // This works for all merge types because GitHub tracks PR associations
    const prNumbers = new Set();
    const commitSHAs = compareData.commits.map(c => c.sha);

    let prLookupFailures = 0;
    let firstLookupFailureMessage = '';
    for (const sha of commitSHAs) {
      try {
        // Use the commits/{sha}/pulls endpoint with stable API headers
        const pullsJson = execFileSync(
          'gh',
          [
            'api',
            `repos/${owner}/${repoName}/commits/${sha}/pulls`,
            '-H',
            'Accept: application/vnd.github+json',
            '-H',
            'X-GitHub-Api-Version: 2022-11-28',
          ],
          { encoding: 'utf-8', stdio: 'pipe' }
        );
        const pulls = JSON.parse(pullsJson);

        for (const pr of pulls) {
          if (pr.number) {
            prNumbers.add(pr.number.toString());
          }
        }
      } catch (e) {
        // Commit might not be associated with a PR, or API call failed.
        // Track failures so permission/config problems are visible in CI logs.
        prLookupFailures++;
        if (!firstLookupFailureMessage) {
          firstLookupFailureMessage = e.message;
        }
        continue;
      }
    }

    if (prNumbers.size === 0) {
      if (prLookupFailures > 0) {
        console.warn(
          `Warning: Failed to look up PR associations for ${prLookupFailures}/${commitSHAs.length} commits. ` +
            `Ensure workflow permissions include pull-requests: read. First error: ${firstLookupFailureMessage}`
        );
      }
      return [];
    }

    // Fetch PR details for issue extraction
    const prDetails = [];
    for (const prNum of Array.from(prNumbers)) {
      try {
        const prJson = execFileSync(
          'gh',
          ['pr', 'view', prNum, '--repo', repo, '--json', 'headRefName,title,body'],
          { encoding: 'utf-8', stdio: 'pipe' }
        );
        prDetails.push(JSON.parse(prJson));
      } catch (e) {
        // PR might not exist or be accessible, skip
        continue;
      }
    }

    return prDetails;
  } catch (e) {
    console.warn(`Warning: Error fetching merged PRs: ${e.message}`);
    return [];
  }
}

function findIssuesInPRs(prs) {
  const issues = new Set();

  for (const pr of prs) {
    // Check branch name - use branch-specific patterns
    if (pr.headRefName) {
      for (const id of findIssueIdsInBranchName(pr.headRefName)) {
        issues.add(id);
      }
    }

    // Check title - use reference patterns (e.g., "Fixes #123")
    if (pr.title) {
      for (const pattern of ISSUE_REF_PATTERNS) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(pr.title)) !== null) {
          if (match[1]) {
            issues.add(match[1]);
          }
        }
      }
    }

    // Check body - use reference patterns (e.g., "Closes #123")
    if (pr.body) {
      for (const pattern of ISSUE_REF_PATTERNS) {
        let match;
        pattern.lastIndex = 0;
        while ((match = pattern.exec(pr.body)) !== null) {
          if (match[1]) {
            issues.add(match[1]);
          }
        }
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

  // Check commit messages (works for merge commits and direct commits)
  const log = getGitLog(previousTag, currentTag);
  const issueIdsFromCommits = findIssues(log);

  // Check merged PRs (works for all merge types: merge, squash, rebase)
  const mergedPRs = getMergedPRsInRange(previousTag, currentTag);
  const issueIdsFromPRs = findIssuesInPRs(mergedPRs);

  // Combine issues from both sources
  const allIssueIds = new Set([...issueIdsFromCommits, ...issueIdsFromPRs]);
  const issueIds = Array.from(allIssueIds).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));

  if (issueIds.length === 0) {
    console.log('No linked issues found in release range (commits / PRs).');
    return;
  }

  console.log(`Found issues: ${issueIds.join(', ')}`);
  if (issueIdsFromPRs.length > 0 || issueIdsFromCommits.length > 0) {
    const sources = [];
    if (issueIdsFromCommits.length > 0) sources.push(`commits: ${issueIdsFromCommits.join(', ')}`);
    if (issueIdsFromPRs.length > 0) sources.push(`PRs: ${issueIdsFromPRs.join(', ')}`);
    console.log(`  (from ${sources.join(', ')})`);
  }

  closeLinkedIssues(issueIds, currentTag);
}

function cleanupBranches() {
  console.log('\nCleaning up merged branches...');

  // fetch latest to ensure we know what is merged
  try {
    execSync('git fetch origin', { stdio: 'ignore' });
  } catch (e) {
    console.warn('Warning: Failed to fetch origin. Branch cleanup might be incomplete.');
  }

  let branchesOutput;
  try {
    // List remote branches merged into origin/main
    branchesOutput = execSync('git branch -r --merged origin/main', { encoding: 'utf-8' });
  } catch (e) {
    console.error(`Error listing merged branches: ${e.message}`);
    return;
  }

  const branchesToDelete = branchesOutput
    .split('\n')
    .map(b => b.trim())
    .filter(b => {
      if (!b) return false;
      // Filter out main, HEAD, and symrefs
      if (b.includes('origin/main')) return false;
      if (b.includes('HEAD')) return false;
      if (b.includes('->')) return false;
      return true;
    })
    .map(b => b.replace('origin/', '')); // remove origin/ prefix for push delete

  if (branchesToDelete.length === 0) {
    console.log('No merged branches to delete.');
    return;
  }

  console.log(`Found ${branchesToDelete.length} merged branches to delete:`);
  branchesToDelete.forEach(b => console.log(` - ${b}`));

  const issueIdsFromBranches = new Set();
  for (const branch of branchesToDelete) {
    for (const id of findIssueIdsInBranchName(branch)) {
      issueIdsFromBranches.add(id);
    }
  }

  const currentTag = getTags()[0];
  if (issueIdsFromBranches.size > 0 && currentTag) {
    console.log(
      `\nClosing issues referenced by merged branch names (${sortIssueIds(Array.from(issueIdsFromBranches)).join(', ')})...`
    );
    closeLinkedIssues(Array.from(issueIdsFromBranches), currentTag);
  } else if (issueIdsFromBranches.size > 0) {
    console.warn('No current tag found; skipping issue close from branch names.');
  }

  branchesToDelete.forEach(branch => {
    try {
      console.log(`Deleting origin/${branch}...`);
      execSync(`git push origin --delete "${branch}"`, { stdio: 'inherit' });
    } catch (e) {
      console.error(`Failed to delete branch ${branch}: ${e.message}`);
    }
  });
}

function main() {
  processIssues();
  cleanupBranches();
}

main();
