# Troubleshooting Guide

## Common Issues and Solutions

### Build Failures

If you encounter build failures with error messages like:

```
Error: ENOENT: no such file or directory, open '.../tfjs-core/src/...'
```

Try these solutions:

1. **Clear the Parcel cache**:

   ```bash
   rm -rf .parcel-cache
   npm start
   ```

2. **Check dependency versions**:
   Make sure your package.json has these devDependencies:

   ```json
   "devDependencies": {
     "buffer": "^6.0.3",
     "parcel": "^2.9.3",
     "process": "^0.11.10",
     "typescript": "^5.0.4",
     "@parcel/transformer-typescript-tsc": "^2.9.3"
   }
   ```

3. **Install missing dependencies**:
   ```bash
   npm install buffer process @parcel/transformer-typescript-tsc
   ```

### Camera Not Working

1. **Check browser permissions**:

   - Make sure you've granted camera access
   - Try accessing the app via HTTPS if on a mobile device

2. **Browser compatibility**:
   - Use Chrome, Safari, or Firefox (latest versions)
   - Safari works best on iOS devices

### TensorFlow.js Model Loading Issues

If the model doesn't load or you see errors like "Failed to fetch" or "Failed to compile":

1. **Check network connection**:
   The model is downloaded from TensorFlow.js servers

2. **Try a different browser**:
   WebGL support varies between browsers

3. **Force the WebGL backend**:
   If you're seeing a message that another backend is being used, it might be fallback to a CPU backend, which is much slower.

### Video Processing Performance

If video analysis is slow or laggy:

1. **Reduce resolution**:
   Try using a lower resolution video

2. **Check device capability**:
   Older devices may struggle with real-time pose detection

3. **Use video files instead of camera**:
   Pre-recorded videos often perform better than live camera feed

### Video Display Issues

If you can't see the video playing or have issues with the overlay:

1. **Video not visible but controls working**:

   - Try the "Debug Options" at the bottom of the app
   - Select "Video Only" to see if the video plays without the overlay
   - Check browser console for errors (F12 -> Console)

2. **Video plays but no pose detection overlay**:

   - Select "Overlay Only" in Debug Options to see if the overlay is being rendered
   - Make sure your browser supports WebGL
   - Check console for TensorFlow.js errors

3. **Video container appears black**:

   - This may be a browser security issue - some browsers block local video playback
   - Try using Chrome or Safari
   - Try uploading a different video format (MP4 is most reliable)

4. **Improper video dimensions**:

   - If the video appears stretched or squished, try a different video with standard dimensions
   - The application works best with videos in landscape orientation
   - Check for console logs showing the detected video dimensions

5. **Canvas and video misaligned**:
   - This can happen when the video has unusual dimensions
   - Try selecting "Video Only" first, then switching back to "Both" after the video starts playing
