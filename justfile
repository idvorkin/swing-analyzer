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

# Run E2E tests (Playwright)
test:
    npm test

# Run E2E tests with UI
test-ui:
    npm run test:ui

# Run E2E tests in headed mode
test-headed:
    npm run test:headed

# Install Playwright browsers
install-browsers:
    npx playwright install

# Deploy to Surge
deploy: build
    npx surge ./dist swing-analyzer.surge.sh
