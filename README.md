# Swing Analyzer

A web-based swing motion analyzer that runs completely in the browser. This application uses TensorFlow.js and MoveNet for pose detection, optimized for iPhone and mobile devices.

## Features

- **Real-time pose detection** using TensorFlow.js
- **Swing motion analysis** with rep counting
- **Spine angle measurement** to analyze swing form
- **Works entirely in the browser** - no server required
- **Mobile-optimized** with responsive design
- **Camera support** for real-time analysis
- **Video upload** for analyzing pre-recorded videos

## Live Demo

- **Production Site**: [https://swing-analyzer.vercel.app](https://swing-analyzer.vercel.app)
- **Debug Site**: [https://swing-analyzer-bh0csa0tu-idvorkins-projects.vercel.app](https://swing-analyzer-bh0csa0tu-idvorkins-projects.vercel.app)

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone this repository
2. Install dependencies:

```bash
cd swing-analyzer
npm install
```

3. Start the development server:

```bash
npm start
```

4. Open your browser to http://localhost:1234

### Building for Production

To build the application for production:

```bash
npm run build
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

### Vercel (Recommended)

This project is configured for easy deployment to Vercel:

1. Push your code to GitHub
2. Import your repository in the Vercel dashboard
3. Vercel will automatically detect and configure the build settings
4. Click "Deploy"

For detailed instructions, see [VERCEL_DEPLOY.md](./VERCEL_DEPLOY.md)

Alternatively, use our deployment script:

```bash
./deploy-to-vercel.sh
```

### GitHub Pages

This project is also set up for automatic deployment to GitHub Pages:

1. When you push to the `main` branch, a GitHub Actions workflow will:

   - Build the application
   - Deploy it to the `gh-pages` branch
   - Make it available on GitHub Pages

2. The deployed application will be available at:

   ```
   https://<username>.github.io/<repository-name>/
   ```

3. For detailed deployment instructions, see [DEPLOY.md](./DEPLOY.md)

## How It Works

The application uses TensorFlow.js with the MoveNet pose detection model, which is optimized for mobile devices. It analyzes the angle of your spine relative to vertical and counts a rep when you go from a hinged position (bent forward) to an upright position.

- **Spine Vertical**: Measures the angle of your spine from vertical (0° is perfectly upright)
- **Rep Counting**: Counts a rep when you transition from a hinged position to upright
- **Body part visualization**: Shows key body parts for the first 0.5 seconds of video/camera

## Comparison to Original YOLO Implementation

This web implementation replaces the original Python YOLO-based code with a browser-based solution that:

1. Uses TensorFlow.js instead of PyTorch
2. Uses MoveNet instead of YOLO for better mobile performance
3. Performs all analysis in the browser with no server requirements
4. Includes the same spine angle and rep counting logic

## License

MIT
