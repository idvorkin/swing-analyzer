# Git Hooks

Shared git hooks for this repository.

## Setup

Run this command to use these hooks:

```bash
git config core.hooksPath .githooks
```

## Hooks

### pre-push

Blocks direct pushes to `main` branch. All changes must go through PRs.

To bypass in emergencies: `git push --no-verify`
