#!/bin/bash
# Non-interactive git commit + push for scheduled GitHub backups.
#
# Usage:
#   bash scripts/git-backup-push.sh [/root/FullMinent-platform]
#
# Environment:
#   GIT_BACKUP_BRANCH=main          (default: main)
#   GIT_BACKUP_REMOTE=origin        (default: origin)
#   GIT_BACKUP_FORCE=1              retry with --force-with-lease if push fails
#   GIT_BACKUP_REPO_URL=...         remote URL when origin is missing
#
# Installed twice daily via: bash scripts/install-git-backup-cron.sh

set -eu

DEPLOY_DIR="${1:-/root/FullMinent-platform}"
BRANCH="${GIT_BACKUP_BRANCH:-main}"
REMOTE="${GIT_BACKUP_REMOTE:-origin}"
FORCE="${GIT_BACKUP_FORCE:-0}"
REPO_URL="${GIT_BACKUP_REPO_URL:-https://github.com/diebartdies/FullMinent-platform.git}"

cd "$DEPLOY_DIR"

echo "==================================================="
echo "FullMinent GitHub backup"
echo "Deploy dir: $DEPLOY_DIR"
echo "Remote: $REMOTE / branch: $BRANCH"
echo "==================================================="

if ! command -v git &>/dev/null; then
  echo "ERROR: git not found"
  exit 1
fi

if [ ! -d .git ]; then
  echo "Initializing git repository..."
  git init
  git branch -M "$BRANCH"
fi

if ! git remote | grep -qx "$REMOTE"; then
  echo "Adding remote $REMOTE -> $REPO_URL"
  git remote add "$REMOTE" "$REPO_URL"
fi

COMMIT_MSG="Platform backup $(date -u '+%Y-%m-%d %H:%M UTC')"
echo "Adding files (respecting .gitignore)..."
git add .

if git diff --cached --name-only | grep -qx '.env'; then
  echo "ERROR: .env is staged — refusing to push secrets to GitHub."
  git reset HEAD .env 2>/dev/null || true
  exit 1
fi

if git diff --cached --name-only | grep -E '\.(pem|key)$|privkey|fullchain'; then
  echo "ERROR: TLS private material is staged — refusing to push."
  exit 1
fi

if git diff --cached --quiet; then
  echo "No new changes to commit."
else
  git commit -m "$COMMIT_MSG"
  echo "Committed: $COMMIT_MSG"
fi

echo "Pushing to ${REMOTE}/${BRANCH}..."
if git push -u "$REMOTE" "$BRANCH"; then
  echo "Push successful."
  exit 0
fi

echo "WARN: Push failed."
if [ "$FORCE" = "1" ]; then
  echo "Retrying with --force-with-lease..."
  git push --force-with-lease -u "$REMOTE" "$BRANCH"
  echo "Force push successful."
  exit 0
fi

echo "ERROR: Push failed. Set GIT_BACKUP_FORCE=1 in cron to retry with --force-with-lease."
exit 1
