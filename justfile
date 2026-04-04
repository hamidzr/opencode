# fork maintenance for hamidzr/opencode (az branch)

upstream := "upstream"
patch_branch := "az"
install_dir := env("HOME") / ".local/bin"

# list available recipes
default:
    @just --list

# show latest stable upstream release tag
latest-release:
    @git fetch {{ upstream }} --tags --quiet
    @git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1

# show current base tag for az branch
current-base:
    @git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' HEAD~1 2>/dev/null || echo "unknown"

# show az-specific commits on top of upstream
patch-log:
    @BASE=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' HEAD~1 2>/dev/null) && \
      git log --oneline "$BASE"..{{ patch_branch }}

# check if az is behind upstream latest
status:
    #!/usr/bin/env bash
    set -euo pipefail
    git fetch {{ upstream }} --tags --quiet
    LATEST=$(git tag --sort=-v:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
    CURRENT=$(git describe --tags --abbrev=0 --match 'v[0-9]*.[0-9]*.[0-9]*' HEAD~1 2>/dev/null || echo "none")
    echo "upstream latest: $LATEST"
    echo "az based on:     $CURRENT"
    if [[ "$CURRENT" == "$LATEST" ]]; then
      echo "up to date"
    else
      echo "behind: run 'just update' to rebase onto $LATEST"
    fi

# rebase az onto latest upstream tag (or a specific tag) then build and install
update tag="":
    ./script/build-az.sh update {{ tag }}

# build and install from current state without rebasing
build:
    ./script/build-az.sh

# run prettier (formatter)
fmt:
    bunx prettier --write .

# alias
format: fmt
fix: fmt

# run typecheck
check:
    bun run typecheck

# aliases
lint: check
