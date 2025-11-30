#!/bin/bash
# Generate version info at build time
#
# This script generates src/generated_version.ts with git metadata.
# The generated file is in .gitignore and should NEVER be committed.
# It is automatically regenerated on each build via the "prebuild" npm script.
#
# For development, run: npm run prebuild (or npm run build/dev which triggers it)

SHA=$(git rev-parse HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
REPO_URL=$(git remote get-url origin | sed 's/\.git$//' | sed 's|git@github.com:|https://github.com/|')
COMMIT_URL="$REPO_URL/commit/$SHA"
CURRENT_URL="$REPO_URL/tree/$BRANCH"
BUILD_TIME=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

cat > src/generated_version.ts <<EOF
/**
 * AUTO-GENERATED FILE - DO NOT EDIT OR COMMIT
 *
 * This file is generated at build time by scripts/generate-version.sh
 * It is listed in .gitignore and should never be checked into version control.
 *
 * To regenerate: npm run prebuild
 *
 * @generated
 */
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
