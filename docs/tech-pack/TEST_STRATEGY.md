# Test Strategy

> **Principle**: Tests are more important than code. Users should never find bugs that tests could have caught.

## Test Pyramid

```
                    ┌─────────────────┐
                    │   E2E Realistic │  Few, slow, catch integration bugs
                    │   (30-60s each) │  Run before release
                    ├─────────────────┤
                    │   E2E Fast      │  Many, fast, catch regression bugs
                    │   (1-3s each)   │  Run on every PR
                    ├─────────────────┤
                    │   Integration   │  Pipeline tests, component tests
                    │   (100-500ms)   │  Run on every commit
                    ├─────────────────┤
                    │   Unit Tests    │  Pure logic, no DOM/browser
                    │   (<50ms each)  │  Run continuously
                    └─────────────────┘
```

## Test Modes

### 1. Unit Tests (Vitest)

**What's tested**: Pure logic - Skeleton angle calculations, SwingAnalyzer state machine, etc.

**When to run**: Continuously during development (`just test-unit`)

**Location**: `src/**/*.test.ts`

**Example**:

```typescript
// Test the rep counting logic in isolation
const analyzer = new SwingAnalyzer();
analyzer.processKeypoints(topPositionKeypoints);
analyzer.processKeypoints(bottomPositionKeypoints);
expect(analyzer.getRepCount()).toBe(1);
```

### 2. E2E Fast (Playwright + Seeded Data)

**What's tested**: UI behavior, navigation, playback controls

**What's mocked**: Pose data is pre-seeded in IndexedDB (no extraction)

**When to run**: On every PR, in CI

**Speed**: 1-3 seconds per test

**Location**: `e2e-tests/user-journey.spec.ts`, `e2e-tests/swing-analyzer.spec.ts`

**Example**:

```typescript
// Seed pose data, test playback UI
await seedPoseTrackFixture(page, 'swing-sample-4reps');
await page.click('#load-hardcoded-btn');
await page.click('#play-pause-btn');
await expect(page.locator('#rep-counter')).not.toHaveText('0');
```

### 3. E2E Realistic (Playwright + Mock Detector)

**What's tested**: Full extraction flow, skeleton rendering, timing behavior

**What's mocked**: Only the ML detector (returns fixture poses with configurable delay)

**When to run**: Before releases, when debugging user-reported issues

**Speed**: 10-60 seconds per test (simulates real timing)

**Location**: `e2e-tests/extraction-flow.spec.ts`

**Example**:

```typescript
// Mock detector with realistic timing (30ms = ~33fps extraction)
await setupMockPoseDetector(page, 'swing-sample', 30);
await page.click('#load-hardcoded-btn');
// Full extraction runs - tests rendering, timing, UI updates
await page.waitForSelector('.pose-status-bar:has-text("ready")');
```

## What to Mock vs. What to Run Real

| Component           | Fast Tests    | Realistic Tests | Rationale                         |
| ------------------- | ------------- | --------------- | --------------------------------- |
| Video element       | Real          | Real            | Fast enough, catches codec issues |
| Pose detection (ML) | Skip (seeded) | Mock with delay | ML is slow, non-deterministic     |
| Frame extraction    | Skip          | Real            | This is where timing bugs live    |
| Pipeline processing | Real          | Real            | Core business logic               |
| Skeleton rendering  | Real          | Real            | Canvas drawing, UI bugs           |
| IndexedDB           | Seeded data   | Fresh           | Test caching behavior             |

## When to Write Which Test

| Scenario                             | Test Type     | Why                          |
| ------------------------------------ | ------------- | ---------------------------- |
| New algorithm (angles, rep counting) | Unit          | Fast feedback, isolate logic |
| New UI component                     | E2E Fast      | Test rendering, interactions |
| Bug reported by user                 | E2E Realistic | Reproduce exact user flow    |
| Performance issue                    | E2E Realistic | Measure real timing          |
| Refactoring                          | All           | Ensure no regressions        |

## CI Configuration

```yaml
# Fast tests on every PR (required to pass)
pr-tests:
  - just test-unit
  - npx playwright test --project=chromium --grep-invert="realistic"

# Realistic tests before release (optional, but review failures)
release-tests:
  - npx playwright test extraction-flow.spec.ts
```

## Debugging User Issues

When a user reports a bug:

1. **Create a realistic test first** that reproduces the issue
2. The test should fail (proving the bug exists)
3. Fix the bug
4. Test passes
5. Consider: should this be a fast test too?

```bash
# Run extraction tests with video recording
npx playwright test extraction-flow.spec.ts --project=chromium

# View the video/trace to see what happened
just e2e-report
```

## Test File Organization

```
e2e-tests/
├── helpers/
│   ├── indexeddb.ts      # Seed/clear IndexedDB
│   ├── mockPoseDetector.ts  # Setup mock ML detector
│   └── video-route.ts    # Intercept video URLs
├── fixtures/
│   ├── index.ts          # Fixture loading
│   └── poses/            # JSON pose data files
├── user-journey.spec.ts  # Fast: UI journey tests
├── swing-analyzer.spec.ts # Fast: Core functionality
├── extraction-flow.spec.ts # Realistic: Full extraction
└── settings.spec.ts      # Fast: Settings UI
```

## Mock Detector Timing

The `frameDelayMs` parameter controls extraction speed:

| Value | Speed   | Use Case                     |
| ----- | ------- | ---------------------------- |
| 0     | Instant | Fast CI tests                |
| 10ms  | ~100fps | Quick realistic tests        |
| 30ms  | ~33fps  | Simulates typical extraction |
| 100ms | ~10fps  | Simulates slow device        |

## Coverage Goals

| Area                       | Target            | Current |
| -------------------------- | ----------------- | ------- |
| Unit (logic)               | 80%+              | TBD     |
| E2E Fast (UI)              | All user journeys | Yes     |
| E2E Realistic (extraction) | Critical paths    | Partial |

## Flaky Test Policy

1. Flaky tests are bugs - fix them, don't skip them
2. If you must skip, create a beads issue to track
3. Increase timeouts only if the delay is expected behavior
4. Use `test.slow()` for genuinely slow tests, not as a bandaid

## Related Docs

- [E2E Testing Plan](../E2E_TESTING_PLAN.md) - Detailed implementation
- [User Journey](../USER_JOURNEY.md) - What users do (test scenarios)
