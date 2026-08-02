# Justfile for swing-analyzer

default:
    @just --list

# One-time setup after clone (run this first!)
setup:
    #!/usr/bin/env bash
    echo "🔧 Setting up development environment..."

    # Configure git hooks
    git config core.hooksPath .githooks
    echo "✓ Git hooks configured (.githooks)"

    # Install npm dependencies
    npm install
    echo "✓ npm dependencies installed"

    # Download test videos for E2E tests
    just download-test-videos

    echo ""
    echo "✅ Setup complete! Run 'just dev' to start developing."
    echo ""
    echo "📝 Note: For Playwright, use a global install (shared across repos):"
    echo "   npm install -g playwright && playwright install --with-deps"

# Download test videos from form-analyzer-samples repo
download-test-videos:
    #!/usr/bin/env bash
    set -euo pipefail
    echo "📥 Downloading test videos..."

    VIDEOS_DIR="public/videos"
    SAMPLES_REPO="idvorkin-ai-tools/form-analyzer-samples"
    SAMPLES_PATH="exercises/kettlebell-swing/good"

    mkdir -p "$VIDEOS_DIR"

    # Download swing-sample.webm (full video, ~26s, ~7MB)
    if [ ! -f "$VIDEOS_DIR/swing-sample.webm" ]; then
        echo "  Downloading swing-sample.webm (~7MB)..."
        gh api "repos/$SAMPLES_REPO/contents/$SAMPLES_PATH/swing-sample.webm" \
            --jq '.download_url' | xargs curl -L --progress-bar -o "$VIDEOS_DIR/swing-sample.webm"
        echo "  ✓ swing-sample.webm"
    else
        echo "  ✓ swing-sample.webm (already exists)"
    fi

    # Download swing-sample-4reps.webm (short video, ~5.5s for fast E2E tests, ~2MB)
    if [ ! -f "$VIDEOS_DIR/swing-sample-4reps.webm" ]; then
        echo "  Downloading swing-sample-4reps.webm (~2MB)..."
        gh api "repos/$SAMPLES_REPO/contents/$SAMPLES_PATH/swing-sample-4reps.webm" \
            --jq '.download_url' | xargs curl -L --progress-bar -o "$VIDEOS_DIR/swing-sample-4reps.webm"
        echo "  ✓ swing-sample-4reps.webm"
    else
        echo "  ✓ swing-sample-4reps.webm (already exists)"
    fi

    # Download pistol-squat-sample.webm (~9MB)
    if [ ! -f "$VIDEOS_DIR/pistol-squat-sample.webm" ]; then
        echo "  Downloading pistol-squat-sample.webm (~9MB)..."
        gh api "repos/$SAMPLES_REPO/contents/exercises/pistols/pistols.webm" \
            --jq '.download_url' | xargs curl -L --progress-bar -o "$VIDEOS_DIR/pistol-squat-sample.webm"
        echo "  ✓ pistol-squat-sample.webm"
    else
        echo "  ✓ pistol-squat-sample.webm (already exists)"
    fi

    echo "✓ Test videos ready in $VIDEOS_DIR"

    # Verify downloads against the tracked fixture hashes. Never
    # auto-update here: rewriting the hashes to match whatever arrived
    # would make a video/fixture mismatch undetectable by construction
    # (especially in CI). On a genuine upstream video change, run
    # `just update-fixture-hashes` deliberately and commit the result.
    just check-fixture-hashes

# Check if fixture hashes match video files
check-fixture-hashes:
    node scripts/update-fixture-hashes.cjs --check

# Update fixture hashes to match current video files
update-fixture-hashes:
    node scripts/update-fixture-hashes.cjs

# Run the development server (forwards extra args, e.g. `just dev --port 5173`)
dev *args:
    npm run dev-called-from-just -- {{args}}

# Start agent dashboard (monitors all agent clones)
dashboard:
    #!/usr/bin/env bash
    DASHBOARD_DIR="$HOME/gits/agent-dashboard"
    if [ ! -d "$DASHBOARD_DIR" ]; then
        echo "📦 Cloning agent-dashboard..."
        git clone https://github.com/idvorkin-ai-tools/agent-dashboard.git "$DASHBOARD_DIR"
        cd "$DASHBOARD_DIR" && npm install
    fi
    cd "$DASHBOARD_DIR" && npm run dev

# Build the project
build:
    npm run build-called-from-just

# Preview the production build
preview:
    npm run preview

# Run unit tests (builds first to ensure fresh build)
test: build
    npm run test-called-from-just

# Generate src/generated_version.ts (gitignored; version-check tests need it)
gen-version:
    ./scripts/generate-version.sh

# Run unit tests without building
test-unit: gen-version
    npm run test:unit

# Run E2E tests (all projects - desktop + mobile)
e2e:
    npx playwright test

# Run fast E2E tests (seeded data, no extraction) - good for CI
e2e-fast:
    npx playwright test user-journey.spec.ts swing-analyzer.spec.ts pose-fixtures.spec.ts settings.spec.ts upload-journey.spec.ts

# Run extraction E2E tests (mock detector, longer tests)
e2e-extraction:
    npx playwright test extraction-flow.spec.ts instant-rep-gallery.spec.ts

# Run E2E tests (desktop chromium only - same as 'e2e' until mobile is enabled)
e2e-desktop:
    npx playwright test --project=chromium

# Run E2E tests with UI
e2e-ui:
    npx playwright test --ui

# Run E2E tests in headed mode
e2e-headed:
    npx playwright test --headed

# Run E2E tests in debug mode
e2e-debug:
    npx playwright test --debug

# View E2E test report in browser
# Serves Playwright HTML report with videos, screenshots, and traces
e2e-report:
    #!/usr/bin/env bash
    HOSTNAME=$(hostname)
    echo "╔════════════════════════════════════════════════════════════════════╗"
    echo "║         Playwright E2E Test Report Server                         ║"
    echo "╚════════════════════════════════════════════════════════════════════╝"
    echo ""
    echo "📊 Report Access:"
    echo "   Local:     http://localhost:9323"
    echo "   Tailscale: http://$HOSTNAME:9323"
    echo ""
    echo "🎬 Viewing Trace Files (requires HTTPS or localhost):"
    echo ""
    echo "   Option 1 (Recommended): Online Trace Viewer"
    echo "   ────────────────────────────────────────────"
    echo "   1. Open report: http://$HOSTNAME:9323"
    echo "   2. Click test → Download .zip trace file"
    echo "   3. Go to: https://trace.playwright.dev/"
    echo "   4. Drag & drop .zip file (all local, no data sent)"
    echo ""
    echo "   Option 2: SSH Tunnel (for direct trace access)"
    echo "   ───────────────────────────────────────────────"
    echo "   ssh -L 9323:localhost:9323 developer@$HOSTNAME"
    echo "   Then open: http://localhost:9323"
    echo ""
    echo "──────────────────────────────────────────────────────────────────────"
    echo "Press Ctrl+C to stop the server"
    echo ""
    npx playwright show-report --host 0.0.0.0 --port 9323

# Install Playwright browsers
install-browsers:
    npx playwright install

# Deploy to Surge
deploy: build
    npx surge ./dist swing-analyzer.surge.sh

# Verify a pose track file matches its video
verify-posetrack posetrack video="":
    #!/usr/bin/env bash
    if [ -n "{{video}}" ]; then
        node scripts/verify-posetrack.cjs "{{posetrack}}" "{{video}}"
    else
        node scripts/verify-posetrack.cjs "{{posetrack}}"
    fi

# Verify pose track from URL
verify-posetrack-url posetrack_url video_url="":
    #!/usr/bin/env bash
    if [ -n "{{video_url}}" ]; then
        node scripts/verify-posetrack.cjs --url "{{posetrack_url}}" "{{video_url}}"
    else
        node scripts/verify-posetrack.cjs --url "{{posetrack_url}}"
    fi
