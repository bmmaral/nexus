import fs from 'fs-extra';
import path from 'path';
import { chmodSync } from 'fs';

const preCommitHook = `#!/bin/sh
# Nexus pre-commit hook

# Check if PRD.md has changed
if git diff --cached --name-only | grep -q "PRD.md"; then
    echo "📝 PRD changed, generating summary..."
    
    # Run nexus PRD summarizer
    if command -v nexus &> /dev/null; then
        nexus summarize prd --staged
    fi
fi

# Validate conversation files
for file in $(git diff --cached --name-only --diff-filter=A | grep "conversations/"); do
    echo "💬 Validating conversation file: $file"
    if command -v nexus &> /dev/null; then
        nexus validate conversation "$file" || exit 1
    fi
done

# Update indexes
if command -v nexus &> /dev/null; then
    echo "📑 Updating indexes..."
    nexus index update
fi

exit 0
`;

const postCommitHook = `#!/bin/sh
# Nexus post-commit hook

# Update conversation graph if conversations changed
if git diff HEAD~1 --name-only | grep -q "conversations/"; then
    if command -v nexus &> /dev/null; then
        nexus timeline refresh &
    fi
fi

# Check if reminder needed
LAST_COMMIT_DATE=$(git log -2 --format="%ct" | tail -1)
CURRENT_DATE=$(date +%s)
DAYS_DIFF=$(( ($CURRENT_DATE - $LAST_COMMIT_DATE) / 86400 ))

if [ $DAYS_DIFF -gt 5 ]; then
    if command -v nexus &> /dev/null; then
        nexus remind check --create-issue &
    fi
fi

# Trigger scout if new modules
if git diff HEAD~1 --name-only | grep -q "modules/"; then
    if command -v nexus &> /dev/null; then
        nexus scout run --async &
    fi
fi

exit 0
`;

const prePushHook = `#!/bin/sh
# Nexus pre-push hook

# Run quick analysis before push
if command -v nexus &> /dev/null; then
    echo "🔍 Running quick analysis before push..."
    nexus analyze --quick
    
    if [ $? -ne 0 ]; then
        echo "⚠️  Analysis found issues. Push anyway? (y/n)"
        read -r response
        if [ "$response" != "y" ]; then
            echo "Push cancelled."
            exit 1
        fi
    fi
fi

exit 0
`;

export async function createGitHooks(projectPath: string): Promise<void> {
  const hooksDir = path.join(projectPath, '.git', 'hooks');
  
  // Ensure hooks directory exists
  await fs.ensureDir(hooksDir);
  
  // Write pre-commit hook
  const preCommitPath = path.join(hooksDir, 'pre-commit');
  await fs.writeFile(preCommitPath, preCommitHook);
  makeExecutable(preCommitPath);
  
  // Write post-commit hook
  const postCommitPath = path.join(hooksDir, 'post-commit');
  await fs.writeFile(postCommitPath, postCommitHook);
  makeExecutable(postCommitPath);
  
  // Write pre-push hook
  const prePushPath = path.join(hooksDir, 'pre-push');
  await fs.writeFile(prePushPath, prePushHook);
  makeExecutable(prePushPath);
}

function makeExecutable(filePath: string): void {
  try {
    // Make the file executable (Unix-like systems)
    chmodSync(filePath, '755');
  } catch (error) {
    // On Windows, this might fail but hooks should still work
    console.warn(`Could not make ${filePath} executable:`, error);
  }
}

export async function removeGitHooks(projectPath: string): Promise<void> {
  const hooksDir = path.join(projectPath, '.git', 'hooks');
  const hooks = ['pre-commit', 'post-commit', 'pre-push'];
  
  for (const hook of hooks) {
    const hookPath = path.join(hooksDir, hook);
    if (await fs.pathExists(hookPath)) {
      const content = await fs.readFile(hookPath, 'utf-8');
      // Only remove if it's a Nexus hook
      if (content.includes('Nexus')) {
        await fs.remove(hookPath);
      }
    }
  }
}


