import { execSync } from 'child_process';

// Configuration for commit categories
const CATEGORIES = [
  {
    title: '✨ Highlights & features',
    patterns: [/✨/, /:sparkles:/, /^feat/, /:globe_with_meridians:/],
  },
  {
    title: '🐛 Bug fixes',
    patterns: [/🐛/, /:bug:/, /^fix/],
  },
  {
    title: '📝 Documentation',
    patterns: [/📝/, /:pencil:/, /^docs/],
  },
  {
    title: '♻️ Refactoring & improvements',
    patterns: [/♻️/, /:recycle:/, /:fire:/, /:zap:/, /^refactor/, /^perf/],
  },
  {
    title: '🔧 Implementation & config',
    patterns: [/🔧/, /:wrench:/, /^chore/, /^build/, /^ci/],
  },
];

function getGitLog(fromTag, toTag) {
  // usage: git log fromTag..toTag
  // If no fromTag, log all up to toTag
  const range = fromTag ? `${fromTag}..${toTag}` : toTag;
  const cmd = `git log ${range} --pretty=format:"%H|%s|%an"`;
  try {
    const output = execSync(cmd, { encoding: 'utf-8' });
    return output
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [hash, subject, author] = line.split('|');
        return { hash, subject, author };
      });
  } catch (e) {
    console.error(`Error getting git log: ${e.message}`);
    return [];
  }
}

function getTags() {
  try {
    // structured sort by creatordate to get chronological order, recent last
    // But we usually want recent first to find the "previous" one.
    // let's use sort=-creatordate
    const output = execSync('git tag --sort=-creatordate', { encoding: 'utf-8' });
    return output.split('\n').filter(Boolean);
  } catch (e) {
    return [];
  }
}

function generateChangelog() {
  const tags = getTags();
  // Expect tags[0] to be the current release (or we are releasing HEAD which matches tags[0])
  // We want range between tags[1] and tags[0].

  // If we assume this script runs during release workflow where tag is checked out:
  // HEAD is likely the tag.

  const currentTag = tags[0];
  const previousTag = tags[1];

  console.error(`Generating changelog for ${currentTag} (previous: ${previousTag || 'initial'})`);

  const commits = getGitLog(previousTag, 'HEAD');

  // Group commits
  const grouped = {};
  const uncategorized = [];

  commits.forEach(commit => {
    // Skip release commits or merges usually?
    if (commit.subject.startsWith('Release v') || commit.subject.startsWith(':rocket: Release'))
      return;
    if (commit.subject.startsWith('Merge branch')) return; // explicit merges for now, unless we want them

    let matched = false;
    for (const cat of CATEGORIES) {
      if (cat.patterns.some(p => p.test(commit.subject))) {
        if (!grouped[cat.title]) grouped[cat.title] = [];
        grouped[cat.title].push(commit);
        matched = true;
        break;
      }
    }
    if (!matched) {
      uncategorized.push(commit);
    }
  });

  let output = '';

  // Generate sections
  CATEGORIES.forEach(cat => {
    const items = grouped[cat.title];
    if (items && items.length > 0) {
      output += `### ${cat.title}\n\n`;
      items.forEach(c => {
        // Format: - subject by @author in commit
        // We'll link commit hash if possible. Since we're in GH actions, we can try to form a link or just use hash.
        // The user's screenshot had "by @user in #PR". We don't have PR easily.
        // We will do: - subject @author
        output += `- ${c.subject} @${c.author} (${c.hash.substring(0, 7)})\n`;
      });
      output += '\n';
    }
  });

  if (uncategorized.length > 0) {
    output += `### Other Changes\n\n`;
    uncategorized.forEach(c => {
      output += `- ${c.subject} @${c.author} (${c.hash.substring(0, 7)})\n`;
    });
    output += '\n';
  }

  // New Contributors?
  // Hard to detect "New" without analyzing all history. We'll skip for now.

  return output;
}

const changelog = generateChangelog();
// Write to generated_notes.md or stdout
// We'll write to stdout so we can redirect in the action
console.log(changelog);
