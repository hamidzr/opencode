#!/usr/bin/env bash
# build opencode with local vim-mode patch on top of latest stable release
# usage: ./script/build-az.sh [upstream-tag]
#   upstream-tag: defaults to latest v* tag from upstream

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

PATCH_BRANCH="leohenon/feat/vim-prompt-input-core"
UPSTREAM_REMOTE="upstream"
INSTALL_DIR="$HOME/.local/bin"

# resolve upstream tag
if [[ -n "${1:-}" ]]; then
  BASE_TAG="$1"
else
  git fetch "$UPSTREAM_REMOTE" --tags --quiet
  BASE_TAG=$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
fi

if [[ -z "$BASE_TAG" ]]; then
  echo "error: could not determine latest stable tag" >&2
  exit 1
fi

AZ_VERSION="${BASE_TAG#v}-az"
AZ_TAG="v${AZ_VERSION}"

echo "==> base: $BASE_TAG, building: $AZ_TAG"

# ensure we're on the patch branch
git checkout "$PATCH_BRANCH" --quiet 2>/dev/null || {
  echo "error: branch $PATCH_BRANCH not found" >&2
  exit 1
}

# rebase the single squashed commit onto the new tag
echo "==> rebasing onto $BASE_TAG"
git rebase --onto "$BASE_TAG" HEAD~1 --quiet

# re-tag
git tag -f "$AZ_TAG"

echo "==> installing dependencies"
bun install --quiet

echo "==> building binary (version $AZ_VERSION)"
OPENCODE_VERSION="$AZ_VERSION" OPENCODE_CHANNEL="latest" \
  bun run --cwd packages/opencode build -- --single

# install
mkdir -p "$INSTALL_DIR"
cp packages/opencode/dist/opencode-darwin-arm64/bin/opencode "$INSTALL_DIR/opencode"
codesign --force --sign - "$INSTALL_DIR/opencode"
xattr -dr com.apple.quarantine "$INSTALL_DIR/opencode" 2>/dev/null || true

echo "==> installed to $INSTALL_DIR/opencode"
