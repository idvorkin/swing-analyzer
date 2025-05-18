# End-to-End Tests for Swing Analyzer

This directory contains end-to-end tests using Playwright that verify the functionality of the Swing Analyzer application.

## Test Structure

- `swing-analyzer.spec.ts`: Main test suite that verifies core functionality

## Running Tests

You can run the tests using the following npm scripts:

```bash
# Run all tests
npm test

# Run tests in UI mode
npm run test:ui

# Run tests in headed mode (with browser visible)
npm run test:headed

# Run tests in debug mode
npm run test:debug
```

## Test Coverage

The tests cover the following functionality:

1. Application loads correctly with all UI elements
2. Hardcoded video loads and plays
3. Spine angle detection works correctly
4. Video controls (play, pause, stop) function properly

## Adding New Tests

When adding new tests, follow these guidelines:

1. Create a descriptive test name using `test('should...', async () => {})` format
2. Use page objects and selectors that are resilient to UI changes
3. Add proper assertions using `expect()`
4. Add appropriate waitFor conditions to handle asynchronous operations

## CI/CD Integration

These tests are configured to run in CI/CD environments. The `playwright.config.ts` file includes settings to:

- Run tests in parallel when not in CI
- Retry tests in CI environments
- Generate HTML reports
- Capture screenshots and videos on failures

To install Playwright browsers for CI, run:

```bash
npx playwright install --with-deps
```
