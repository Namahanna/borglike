#!/bin/bash
# Release script for orphan snapshot workflow
# Usage: ./scripts/release.sh [patch|minor|major]

set -e

VERSION_TYPE=${1:-patch}

echo "🚀 Starting release process (${VERSION_TYPE})..."

# 1. Bump version and create tag on main
echo "📦 Bumping version..."
pnpm version ${VERSION_TYPE}

# Get the new version tag
NEW_TAG=$(git describe --tags --abbrev=0)
echo "✅ Created tag: ${NEW_TAG}"

# 2. Push to gitea with tags
echo "📤 Pushing to gitea..."
git push gitea main --follow-tags

# 3. Create orphan commit for github
echo "🌱 Creating clean orphan commit..."
git checkout --orphan github-release
git add -A
git commit -m "Release ${NEW_TAG}"

# 4. Re-tag the orphan commit (github tag must point to github commit)
echo "🏷️  Tagging orphan commit..."
git tag -f ${NEW_TAG}

# 5. Force push to github
echo "📤 Pushing snapshot to github..."
git push github github-release:main --force

# 6. Push tag to github
echo "🏷️  Pushing tag to github..."
git push github ${NEW_TAG} --force

# 6. Cleanup
echo "🧹 Cleaning up..."
git checkout main
git branch -D github-release

echo "✅ Release ${NEW_TAG} complete!"
echo "🌐 GitHub Pages deploying at: https://github.com/Namahanna/borglike/actions"
