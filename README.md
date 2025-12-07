# Swing Analyzer

A web-based swing motion analyzer that runs completely in the browser. This application uses TensorFlow.js and BlazePose for pose detection, optimized for iPhone and mobile devices.

## Features

- **Real-time pose detection** using TensorFlow.js
- **Swing motion analysis** with rep counting
- **Spine angle measurement** to analyze swing form
- **Works entirely in the browser** - no server required
- **Mobile-optimized** with responsive design
- **Camera support** for real-time analysis
- **Video upload** for analyzing pre-recorded videos

## Live Demo

- **Production Site**: [https://swing-analyzer.surge.sh](https://swing-analyzer.surge.sh)

## Getting Started

### Prerequisites

- Node.js (v20 or higher)
- npm
- [just](https://github.com/casey/just) command runner (optional but recommended)

### Installation

1. Clone this repository
2. Install dependencies:

```bash
npm install
```

### Development

Start the development server:

```bash
just dev
# or
npm run dev
```

Then open your browser to http://localhost:5173

### Other Common Commands

```bash
just build          # Build for production
just preview        # Preview production build
just test           # Run E2E tests
just test-ui        # Run tests with UI
just deploy         # Build and deploy to Surge
```

Or use npm directly:

```bash
npm run build       # Build for production
npm run preview     # Preview production build
npm test            # Run E2E tests
```

The built files will be available in the `dist` directory.

## Usage

### Analyzing Video Files

1. Click the file upload button and select a video file
2. Press the Play button to start analysis
3. View swing metrics in real-time
4. The rep counter will increment each time a swing is detected

### Using the Camera

1. Click the "Start Camera" button
2. Position yourself so your full body is visible
3. Perform swinging motions
4. View your metrics in real-time

## Deployment

### Surge (Current Deployment)

This project is configured for automatic deployment to Surge:

1. When you push to the `main` branch, a GitHub Actions workflow will automatically:
   - Build the application
   - Deploy it to [swing-analyzer.surge.sh](https://swing-analyzer.surge.sh)

2. For manual deployment, use:

```bash
just deploy
# or
npm run build && npx surge ./dist swing-analyzer.surge.sh
```

For detailed deployment instructions, see [DEPLOY.md](./DEPLOY.md)

## How It Works

The application uses TensorFlow.js with the BlazePose pose detection model (33 keypoints normalized to COCO-17 format). It analyzes the angle of your spine relative to vertical and counts a rep when you go from a hinged position (bent forward) to an upright position.

- **Spine Vertical**: Measures the angle of your spine from vertical (0° is perfectly upright)
- **Rep Counting**: Counts a rep when you transition from a hinged position to upright
- **Body part visualization**: Shows key body parts for the first 0.5 seconds of video/camera

## License

MIT
