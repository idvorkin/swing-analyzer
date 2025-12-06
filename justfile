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
    echo "📥 Downloading test videos..."

    VIDEOS_DIR="public/videos"
    SAMPLES_REPO="idvorkin-ai-tools/form-analyzer-samples"
    SAMPLES_PATH="exercises/kettlebell-swing/good"

    mkdir -p "$VIDEOS_DIR"

    # Download swing-sample.webm (full video, ~26s)
    if [ ! -f "$VIDEOS_DIR/swing-sample.webm" ]; then
        echo "  Downloading swing-sample.webm..."
        gh api "repos/$SAMPLES_REPO/contents/$SAMPLES_PATH/swing-sample.webm" \
            --jq '.download_url' | xargs curl -sL -o "$VIDEOS_DIR/swing-sample.webm"
        echo "  ✓ swing-sample.webm"
    else
        echo "  ✓ swing-sample.webm (already exists)"
    fi

    # Download swing-sample-4reps.webm (short video, ~5.5s for fast E2E tests)
    if [ ! -f "$VIDEOS_DIR/swing-sample-4reps.webm" ]; then
        echo "  Downloading swing-sample-4reps.webm..."
        gh api "repos/$SAMPLES_REPO/contents/$SAMPLES_PATH/swing-sample-4reps.webm" \
            --jq '.download_url' | xargs curl -sL -o "$VIDEOS_DIR/swing-sample-4reps.webm"
        echo "  ✓ swing-sample-4reps.webm"
    else
        echo "  ✓ swing-sample-4reps.webm (already exists)"
    fi

    echo "✓ Test videos ready in $VIDEOS_DIR"

# Run the development server
dev:
    npm run dev

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
    npm run build

# Preview the production build
preview:
    npm run preview

# Run unit tests
test-unit:
    npm run test:unit

# Run E2E tests (all projects - desktop + mobile)
e2e:
    npx playwright test

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
