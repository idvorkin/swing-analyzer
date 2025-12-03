# Justfile for swing-analyzer

default:
    @just --list

# Run the development server
dev:
    npm run dev

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
