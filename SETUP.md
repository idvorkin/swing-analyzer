# Quick Start Guide

Follow these steps to set up and run the Swing Analyzer application:

## Setup

1. **Install Node.js** if you don't have it already:
   - Download from [nodejs.org](https://nodejs.org)
   - Recommended version: 16.x or newer

2. **Install dependencies**:
   ```bash
   cd swing-analyzer
   npm install
   ```
   This will install all required packages including:
   - TensorFlow.js
   - Pose detection models
   - Parcel bundler

## Running the Application

1. **Start the development server**:
   ```bash
   npm start
   ```

2. **Open in browser**:
   - The application will be available at [http://localhost:1234](http://localhost:1234)
   - For iPhone testing, use the same WiFi network and access using your computer's IP address

## Testing on iPhone

For optimal performance on iPhone:

1. Use Safari browser
2. Allow camera permissions when prompted
3. Use landscape orientation for better viewing
4. Position yourself so your full body is visible
5. Make sure you have good lighting

## Troubleshooting

- **Camera not working**: Make sure you've granted camera permissions in your browser
- **Slow performance**: Try reducing motion or using a video file instead of live camera
- **Model loading error**: Check your internet connection, as models are downloaded from TensorFlow servers

## Building for Deployment

To create a production build:

```bash
npm run build
```

This creates optimized files in the `dist` directory that you can deploy to any static web hosting service:
- GitHub Pages
- Netlify
- Vercel
- Amazon S3
- etc.

No server-side code is needed as everything runs in the browser. 