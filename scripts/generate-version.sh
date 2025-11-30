#!/bin/bash
# Generate version info at build time

SHA=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
REPO_URL=$(git remote get-url origin | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
COMMIT_URL="$REPO_URL/commit/$SHA"
CURRENT_URL="$REPO_URL/tree/$BRANCH"
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > src/generated_version.ts <<EOF
// Auto-generated at build time - DO NOT EDIT
export const GIT_SHA: string = "$SHA";
export const GIT_SHA_SHORT: string = "${SHA:0:7}";
export const GIT_COMMIT_URL: string = "$COMMIT_URL";
export const GIT_CURRENT_URL: string = "$CURRENT_URL";
export const GIT_BRANCH: string = "$BRANCH";
export const BUILD_TIMESTAMP: string = "$BUILD_TIME";
EOF

echo "Generated src/generated_version.ts"
echo "  SHA: ${SHA:0:7}"
echo "  Branch: $BRANCH"
echo "  Build time: $BUILD_TIME"
