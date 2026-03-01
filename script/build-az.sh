#!/usr/bin/env bash
# build opencode with local vim-mode patch
# usage: ./script/build-az.sh [update [upstream-tag]]
#   update: fetch latest upstream tag, rebase patch branch onto it, then build
#   no args: build from current state as-is

set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_DIR"

PATCH_BRANCH="leohenon/feat/vim-prompt-input-core"
UPSTREAM_REMOTE="upstream"
INSTALL_DIR="$HOME/.local/bin"

MODE="${1:-build}"

if [[ "$MODE" == "update" ]]; then
  # resolve upstream tag
  if [[ -n "${2:-}" ]]; then
    BASE_TAG="$2"
  else
    git fetch "$UPSTREAM_REMOTE" --tags --quiet
    BASE_TAG=$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
  fi

  if [[ -z "$BASE_TAG" ]]; then
    echo "error: could not determine latest stable tag" >&2
    exit 1
  fi

  echo "==> updating: rebasing onto $BASE_TAG"

  # ensure we're on the patch branch
  git checkout "$PATCH_BRANCH" --quiet 2>/dev/null || {
    echo "error: branch $PATCH_BRANCH not found" >&2
    exit 1
  }

  git rebase --onto "$BASE_TAG" HEAD~1 --quiet

  AZ_VERSION="${BASE_TAG#v}-az"
  git tag -f "v${AZ_VERSION}"
fi

# derive version from current HEAD's closest tag
AZ_VERSION="${AZ_VERSION:-$(git describe --tags --abbrev=0 2>/dev/null | sed 's/^v//')}"
if [[ -z "$AZ_VERSION" ]]; then
  echo "error: could not determine version from current HEAD" >&2
  exit 1
fi

echo "==> building: v${AZ_VERSION}"

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
