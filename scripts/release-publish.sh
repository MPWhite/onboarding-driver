#!/usr/bin/env bash
#
# Release publish command for changesets/action.
#
# changesets/action passes the `publish:` value to @actions/exec, which
# does NOT run it through a shell. That means multi-line `if/then/else`
# in the workflow YAML's `publish:` field doesn't actually get
# interpreted — bash isn't invoked. Hence this script, which IS run by
# a shell (via the shebang) and can safely do conditional logic.
#
# Behavior:
#   - If $NPM_TOKEN is non-empty, publish all public workspace packages.
#   - Otherwise, emit a GitHub Actions warning and exit 0 so the
#     release workflow stays green in pre-release repo state.

set -euo pipefail

if [ -n "${NPM_TOKEN:-}" ]; then
  echo "NPM_TOKEN is set — running pnpm publish"
  pnpm -r publish --access public --no-git-checks
else
  echo "::warning::NPM_TOKEN not set — skipping publish. Configure the secret to enable releases."
  exit 0
fi
