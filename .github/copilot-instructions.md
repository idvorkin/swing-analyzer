# Swing Analyzer - GitHub Copilot Instructions

## Project Overview

Swing Analyzer is a web-based swing motion analyzer that runs completely in the browser. This application uses TensorFlow.js and MoveNet for pose detection, optimized for iPhone and mobile devices. The application analyzes kettlebell swing form and counts repetitions by detecting body positions and spine angles.

**Target Audience**: Fitness enthusiasts, specifically users performing kettlebell swings who want to track and improve their form.

**Key Features**:
- Real-time pose detection using TensorFlow.js and MoveNet
- Swing motion analysis with automatic rep counting
- Spine angle measurement to analyze swing form
- Works entirely in the browser - no server required
- Mobile-optimized with responsive design
- Camera support for real-time analysis
- Video upload for analyzing pre-recorded videos

## Technology Stack

### Core Technologies
- **Frontend Framework**: React 18.2+ with TypeScript
- **Build Tool**: Parcel 2.9+
- **Language**: TypeScript 5.0+ (strict mode enabled)
- **Reactive Programming**: RxJS 7.8+ for asynchronous event processing
- **Machine Learning**: TensorFlow.js with MoveNet pose detection model
- **Routing**: React Router DOM 7.6+

### Development Tools
- **Linter & Formatter**: Biome (primary), Prettier (fallback for unsupported file types)
- **Pre-commit Hooks**: pre-commit with Biome, Prettier, and TypeScript type checking
- **Testing**: Playwright for E2E tests
- **Deployment**: Vercel (production), GitHub Pages (alternative)

### Key Dependencies
- `@tensorflow-models/pose-detection`: Pose detection models
- `@mediapipe/pose`: MediaPipe pose detection backend
- `rxjs`: Reactive programming library
- `react-router-dom`: Client-side routing

## Architecture

### System Overview
The application follows a reactive pipeline architecture with clear separation of concerns:

1. **React UI Layer**: Components, Context API, Custom Hooks
2. **Core Logic Layer**: Pipeline orchestration and stage processing
3. **Pipeline Stages**: VideoFrameAcquisition → PoseSkeletonTransformer → SwingFormProcessor → SwingRepProcessor
4. **Data Models**: Skeleton, FormCheckpoint, PipelineResult, various Event types
5. **Services**: FormCheckpointLogic, FormCheckpointUX, SkeletonRenderer

### Key Architectural Patterns
- **Reactive Streams**: RxJS Observables for frame processing pipeline
- **React Context**: Shared state management via `SwingAnalyzerContext`
- **Custom Hooks**: Logic encapsulation in `useSwingAnalyzer`
- **Provider Pattern**: Global state access through context providers
- **Component Composition**: Container and presentation component separation

See `ARCHITECTURE.md` for detailed diagrams and explanations.

## Coding Standards & Guidelines

### TypeScript
- **Strict Mode**: Always use TypeScript strict mode (`strict: true`)
- **Type Annotations**: Prefer explicit types over implicit inference
- **No Any**: Avoid `any` type; use proper types or `unknown`
- **Interface vs Type**: Use interfaces for object shapes, types for unions/intersections

### Code Style
- **Formatting**: Use Biome for JavaScript/TypeScript/JSON/CSS
  - Indent: 2 spaces
  - Quotes: Single quotes
  - Semicolons: Always required
  - Trailing commas: ES5 style
- **Naming Conventions**:
  - React components: PascalCase (e.g., `VideoSection.tsx`)
  - Hooks: camelCase with `use` prefix (e.g., `useSwingAnalyzer`)
  - Variables/functions: camelCase
  - Constants: UPPER_SNAKE_CASE for true constants
  - Type/Interface names: PascalCase
- **Imports**: Organize imports (Biome handles this automatically)

### React Best Practices
- **Function Components**: Use function components with hooks (no class components)
- **Hooks**: Follow React hooks rules (don't call hooks conditionally)
- **Context**: Use context for truly global state, props for local state
- **Memoization**: Use `React.memo`, `useMemo`, `useCallback` for performance optimization
- **Console Logs**: Add meaningful console.log statements for debugging (see existing pattern in components)

### RxJS Patterns
- **Observable Naming**: Suffix observables with `$` (e.g., `frameEvents$`)
- **Subscription Cleanup**: Always unsubscribe in component cleanup/useEffect return
- **Operators**: Prefer RxJS operators over imperative code
- **Error Handling**: Use proper error handling operators (catchError, retry)

### File Organization
```
src/
  components/       # React UI components
  contexts/         # React context definitions
  hooks/            # Custom React hooks
  models/           # Data models and types
  pipeline/         # Processing pipeline stages
  viewmodels/       # View logic and rendering
  types.ts          # Shared type definitions
  index.ts          # Application entry point
```

## Build, Test, and Development

### Development Commands
```bash
# Install dependencies
npm install

# Start development server (http://localhost:1234)
npm start

# Build for production
npm run build

# Build for Vercel
npm run vercel-build
```

### Testing Commands
```bash
# Run E2E tests
npm test

# Run tests with UI
npm run test:ui

# Run tests in headed mode (with browser visible)
npm run test:headed

# Run tests in debug mode
npm run test:debug
```

### Linting & Type Checking
```bash
# Run Biome linting and formatting
npx biome check --write .

# Run TypeScript type checking
npx tsc --noEmit

# Run pre-commit hooks manually
pre-commit run --all-files
```

### Pre-commit Hooks
The repository uses pre-commit hooks that run automatically before commits:
- Biome: Linting and formatting for JS/TS/JSON/CSS
- Prettier: Fallback for Markdown, YAML, HTML
- TypeScript: Type checking with `tsc --noEmit`

## Development Workflow

1. **Starting Development**:
   - Run `npm install` to install dependencies
   - Run `npm start` to start the development server
   - Access the app at `http://localhost:1234`

2. **Making Changes**:
   - Write TypeScript code following the coding standards
   - Use existing components and patterns as reference
   - Add meaningful console.log statements for debugging
   - Test changes in the browser (both desktop and mobile)

3. **Before Committing**:
   - Run `npx biome check --write .` to format code
   - Run `npx tsc --noEmit` to check for type errors
   - Run `npm test` to ensure E2E tests pass
   - Pre-commit hooks will run automatically

4. **Testing**:
   - Test with both camera and video upload modes
   - Test on mobile devices (or mobile emulation)
   - Verify pose detection and rep counting work correctly
   - Check that UI is responsive and accessible

## Documentation & Resources

### Repository Documentation
- `README.md`: Project overview, features, and quick start
- `ARCHITECTURE.md`: Detailed architecture and data flow diagrams
- `SETUP.md`: Development setup instructions
- `DEPLOY.md`: GitHub Pages deployment guide
- `VERCEL_DEPLOY.md`: Vercel deployment guide
- `TROUBLESHOOTING.md`: Common issues and solutions

### External Resources
- [TensorFlow.js Pose Detection](https://github.com/tensorflow/tfjs-models/tree/master/pose-detection)
- [MoveNet Model](https://www.tensorflow.org/hub/tutorials/movenet)
- [RxJS Documentation](https://rxjs.dev/)
- [React Documentation](https://react.dev/)
- [Kettlebell Swings Information](https://idvork.in/kettlebell)

## Important Notes

### Performance Considerations
- The app uses GPU acceleration through WebGL backend
- Model is cached for faster loading
- Frame processing is optimized through reactive streams
- Avoid blocking the main thread during frame processing

### Browser Compatibility
- Targets last 3 versions of Chrome, Firefox, and Safari
- Requires browser support for WebGL and MediaDevices API
- Mobile Safari and Chrome are primary targets

### Security & Privacy
- All processing happens in the browser (no data sent to servers)
- Camera/video access requires user permission
- No personal data is stored or transmitted

## Common Patterns

### Adding a New Pipeline Stage
1. Implement the stage interface from `pipeline/PipelineInterfaces.ts`
2. Create an Observable that transforms input events
3. Register the stage in `PipelineFactory`
4. Update the pipeline chain in `Pipeline.ts`

### Adding a New Component
1. Create component file in `src/components/`
2. Use TypeScript with explicit types
3. Follow React hooks patterns
4. Use context for global state, props for local state
5. Add meaningful console.log statements
6. Style with CSS (co-located .css file)

### Working with Observables
1. Create observables using RxJS operators
2. Subscribe in useEffect with proper cleanup
3. Use operators like `map`, `filter`, `scan` for transformations
4. Handle errors with `catchError`
5. Clean up subscriptions on component unmount
