# Swing Analyzer - GitHub Copilot Instructions

## Project Overview

Swing Analyzer is a web-based swing motion analyzer that runs completely in the browser. The application uses TensorFlow.js with MoveNet for pose detection, optimized for iPhone and mobile devices. It analyzes swing motion in real-time through camera input or uploaded videos.

**Live Demo**: [https://swing-analyzer.vercel.app](https://swing-analyzer.vercel.app)

## Technology Stack

- **Frontend Framework**: React 18 with TypeScript
- **Build Tool**: Parcel bundler
- **ML/AI**: TensorFlow.js with MoveNet pose detection model, MediaPipe Pose
- **Reactive Programming**: RxJS for asynchronous data streaming
- **Testing**: Playwright for end-to-end tests
- **Linting/Formatting**: Biome
- **Deployment**: Vercel (primary), GitHub Pages (alternative)

## Project Structure

```
swing-analyzer/
├── src/
│   ├── components/       # React UI components
│   ├── contexts/         # React Context API for state management
│   ├── hooks/           # Custom React hooks
│   ├── models/          # Data models (Skeleton, FormCheckpoint, etc.)
│   ├── pipeline/        # Reactive processing pipeline stages
│   ├── viewmodels/      # Business logic and services
│   └── types.ts         # TypeScript type definitions
├── public/              # Static assets and index.html
├── e2e-tests/          # Playwright end-to-end tests
└── dist/               # Build output (auto-generated)
```

## Architecture Principles

1. **Reactive Pipeline Architecture**: The application uses RxJS Observables to process video frames through a multi-stage pipeline:
   - VideoFrameAcquisition → PoseSkeletonTransformer → SwingFormProcessor → SwingRepProcessor

2. **React State Management**: 
   - Context API for global state sharing
   - Custom hooks (especially `useSwingAnalyzer`) for encapsulating logic
   - Reactive state updates through RxJS pipeline subscriptions

3. **Type Safety**: Strict TypeScript configuration with no implicit any types

4. **Performance**: Optimized for mobile devices with GPU acceleration via WebGL backend

## Development Workflow

### Installation and Setup

```bash
npm install
```

### Development Server

```bash
npm start
# Opens at http://localhost:1234
```

### Building

```bash
npm run build
# Output in dist/ directory
```

### Testing

```bash
npm test                # Run all Playwright tests
npm run test:ui        # Run tests with UI
npm run test:headed    # Run tests in headed mode
npm run test:debug     # Run tests in debug mode
```

### Linting and Formatting

The project uses Biome for linting and formatting:
- Configuration in `biome.json`
- Format style: 2-space indentation, single quotes, semicolons, ES5 trailing commas
- Code formatting is enforced through Biome

## Code Style and Conventions

### TypeScript

- Use strict TypeScript settings (enabled in `tsconfig.json`)
- Always define explicit types; avoid `any`
- Use interfaces for object shapes and types for unions/primitives
- Enable `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch`

### React Components

- Use functional components with hooks
- Prefer custom hooks for reusable logic
- Use React Context for global state (avoid prop drilling)
- Component files should be in PascalCase (e.g., `VideoSection.tsx`)

### RxJS and Pipeline

- Pipeline stages should implement defined interfaces
- Use Observables for asynchronous data streams
- Clean up subscriptions properly in React components (useEffect cleanup)

### File Organization

- Group related functionality in directories (components, hooks, models, etc.)
- Keep business logic separate from UI components (use viewmodels/services)
- Models should define data structures, not contain logic

### Comments

- Use TSDoc format for function/class documentation when needed
- Comment complex algorithms or non-obvious code
- Don't over-comment obvious code

## Contribution Guidelines

### Making Changes

1. **Understand the Pipeline**: If modifying analysis logic, understand how the reactive pipeline works (see ARCHITECTURE.md)

2. **Maintain Type Safety**: Ensure all changes maintain TypeScript strict mode compliance

3. **Test Your Changes**: 
   - Test manually in the browser at http://localhost:1234
   - Add or update Playwright tests for user-facing changes
   - Test on mobile devices (especially iPhone) when possible

4. **Follow Code Style**: Code should match existing Biome formatting rules

5. **Keep Dependencies Minimal**: Only add new dependencies if absolutely necessary

### Testing Requirements

- All user-facing features should have Playwright end-to-end tests
- Test video upload and camera input scenarios when relevant
- Tests are located in `e2e-tests/` directory
- Use the Playwright test configuration in `playwright.config.ts`

### Documentation

- Update README.md for user-facing changes
- Update ARCHITECTURE.md if changing the pipeline or architecture
- Update this file if changing development workflow or conventions

## Common Tasks

### Adding a New Pipeline Stage

1. Create the stage class implementing the appropriate pipeline interface
2. Add it to the PipelineFactory
3. Update the Pipeline class to include it in the processing flow
4. Update ARCHITECTURE.md with the new stage

### Adding a New UI Component

1. Create the component in `src/components/`
2. If it needs global state, use the SwingAnalyzerContext
3. Create custom hooks in `src/hooks/` for component logic
4. Add Playwright tests for user interactions

### Modifying Pose Detection

1. Changes typically go in `PoseSkeletonTransformer` pipeline stage
2. Models are defined in `src/models/Skeleton.ts`
3. Test thoroughly as this affects all downstream processing

### Adding New Metrics

1. Define the metric in the appropriate model (e.g., FormCheckpoint)
2. Add calculation logic in the relevant pipeline stage or service
3. Update UI components to display the metric
4. Add tests to verify metric calculations

## Deployment

- **Primary**: Vercel (automatic deployment on push)
- **Alternative**: GitHub Pages via GitHub Actions
- See DEPLOY.md and VERCEL_DEPLOY.md for detailed deployment instructions

## Important Notes

- **Browser-Only**: This application runs entirely in the browser with no backend server
- **Mobile-First**: Optimize for mobile performance, especially iPhone/Safari
- **Model Loading**: TensorFlow.js models are downloaded from TensorFlow servers on first load
- **Camera Permissions**: Users must grant camera permissions for live analysis
- **Performance**: Use GPU acceleration when available; be mindful of mobile device limitations

## Getting Help

- See TROUBLESHOOTING.md for common issues
- Check ARCHITECTURE.md for detailed system design
- See README.md for user-facing documentation
- Review existing code for patterns and conventions
