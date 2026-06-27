#!/usr/bin/env bash
# Sync the local asset/ folder to the gh-pages branch on origin.
#
# Why this exists:
#   The portfolio (deployed on Netlify) loads images/videos/audio/fonts from
#   GitHub Pages instead of bundling them with each Netlify deploy. The
#   gh-pages branch on `origin` hosts those files at
#   https://aaditxn13.github.io/Portfolio---2026/asset/<path>.
#
# Run this whenever you add, remove, or change anything in asset/.
#
# Usage:
#   ./scripts/sync-assets-to-gh-pages.sh                # commit + push
#   ./scripts/sync-assets-to-gh-pages.sh --dry-run      # show diff, don't push
#   ./scripts/sync-assets-to-gh-pages.sh -m "msg"       # custom commit message
#
# Requirements: git (worktree support), a clean push access to `origin`.

set -euo pipefail

REMOTE="origin"
BRANCH="gh-pages"
WORKTREE_DIR="$(mktemp -d -t portfolio-gh-pages.XXXX)"
DRY_RUN=0
COMMIT_MSG="Sync assets from main ($(date -u +%Y-%m-%dT%H:%M:%SZ))."

while (($#)); do
    case "$1" in
        --dry-run) DRY_RUN=1; shift ;;
        -m|--message) COMMIT_MSG="$2"; shift 2 ;;
        -h|--help)
            sed -n '1,20p' "$0"; exit 0 ;;
        *) echo "Unknown arg: $1" >&2; exit 1 ;;
    esac
done

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

if [[ ! -d asset ]]; then
    echo "error: no asset/ directory found at $REPO_ROOT" >&2
    exit 1
fi

cleanup() {
    if git worktree list --porcelain | grep -q "$WORKTREE_DIR"; then
        git worktree remove --force "$WORKTREE_DIR" >/dev/null 2>&1 || true
    fi
    rm -rf "$WORKTREE_DIR"
}
trap cleanup EXIT

echo "→ fetching $REMOTE/$BRANCH"
git fetch "$REMOTE" "$BRANCH" --quiet

echo "→ checking out $BRANCH into $WORKTREE_DIR"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
    git worktree add "$WORKTREE_DIR" "$BRANCH" >/dev/null
    (cd "$WORKTREE_DIR" && git reset --hard "$REMOTE/$BRANCH" >/dev/null)
else
    git worktree add -B "$BRANCH" "$WORKTREE_DIR" "$REMOTE/$BRANCH" >/dev/null
fi

echo "→ syncing asset/ contents"
rm -rf "$WORKTREE_DIR/asset"
mkdir -p "$WORKTREE_DIR/asset"
rsync -a --delete \
    --exclude '.DS_Store' \
    --exclude 'node_modules' \
    --exclude '*.original.mp4' \
    --exclude '*.sb-*' \
    "$REPO_ROOT/asset/" "$WORKTREE_DIR/asset/"

touch "$WORKTREE_DIR/.nojekyll"

cd "$WORKTREE_DIR"
git add -A

if git diff --cached --quiet; then
    echo "✓ no asset changes to push"
    exit 0
fi

echo "→ staged changes:"
git diff --cached --stat | sed 's/^/    /'

if (( DRY_RUN )); then
    echo "(dry run) skipping commit + push"
    exit 0
fi

git -c user.name="${GIT_AUTHOR_NAME:-$(git config --get user.name || echo Portfolio)}" \
    -c user.email="${GIT_AUTHOR_EMAIL:-$(git config --get user.email || echo portfolio@local)}" \
    commit -m "$COMMIT_MSG" >/dev/null

echo "→ pushing to $REMOTE/$BRANCH"
git push "$REMOTE" "$BRANCH"

NEW_COMMIT="$(git -C "$WORKTREE_DIR" rev-parse HEAD)"

# Bump the pinned commit hash inside head-boot.js so jsDelivr serves the
# freshest assets with its immutable 1-year cache. This is the whole reason
# we pin by commit instead of by branch name.
HEAD_BOOT="$REPO_ROOT/asset/head-boot.js"
if [[ -f "$HEAD_BOOT" ]]; then
    if grep -q "ASSETS_PINNED_COMMIT = '" "$HEAD_BOOT"; then
        # macOS BSD sed needs the empty '' after -i, GNU sed does not.
        if sed --version >/dev/null 2>&1; then
            sed -i "s/ASSETS_PINNED_COMMIT = '[a-f0-9]*'/ASSETS_PINNED_COMMIT = '$NEW_COMMIT'/" "$HEAD_BOOT"
        else
            sed -i '' "s/ASSETS_PINNED_COMMIT = '[a-f0-9]*'/ASSETS_PINNED_COMMIT = '$NEW_COMMIT'/" "$HEAD_BOOT"
        fi
        echo "→ pinned asset/head-boot.js to commit $NEW_COMMIT"
    else
        echo "warn: could not find ASSETS_PINNED_COMMIT in asset/head-boot.js; skipping pin update" >&2
    fi
fi

# Re-bake the new commit into every absolute URL in the static files. This
# is what tells the browser "fetch this exact immutable version" so the
# 1-year cache is keyed correctly.
if [[ -f "$REPO_ROOT/scripts/rewrite-asset-urls.mjs" ]]; then
    echo "→ rebaking absolute URLs in HTML/CSS/JS"
    (cd "$REPO_ROOT" && node scripts/rewrite-asset-urls.mjs) | sed 's/^/    /'
fi

echo "✓ assets synced"
echo "  jsDelivr: https://cdn.jsdelivr.net/gh/Aaditxn13/Portfolio---2026@$NEW_COMMIT/asset/"
echo "  fallback: https://aaditxn13.github.io/Portfolio---2026/asset/"
echo ""
echo "Next: review & commit the touched files on main so Netlify picks up"
echo "      the new pinned commit:"
echo "      git status && git add -A && git commit -m 'Bump pinned assets to $NEW_COMMIT.'"
