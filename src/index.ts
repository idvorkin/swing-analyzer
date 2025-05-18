// Setup TensorFlow.js
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl';
import '@tensorflow/tfjs-converter';

import React from 'react';
// React imports
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './components/App';

// Initialize TensorFlow backend
async function initialize() {
  console.log('Initializing TensorFlow.js...');

  try {
    // Check available backends
    const backends = Object.keys(tf.engine().registryFactory);
    console.log('Available TensorFlow backends:', backends);

    // Force WebGL backend for best performance
    await tf.setBackend('webgl');
    const currentBackend = tf.getBackend();

    console.log(`TensorFlow.js backend initialized: ${currentBackend}`);
    console.log(`WebGL version: ${tf.env().getNumber('WEBGL_VERSION')}`);
    console.log(`Device pixel ratio: ${window.devicePixelRatio}`);

    // Report if we couldn't use WebGL
    if (currentBackend !== 'webgl') {
      console.warn(
        `WebGL not available, using ${currentBackend} instead. Performance may be affected.`
      );
    }

    // Render React app after TensorFlow initialization
    const rootElement = document.getElementById('root');
    if (rootElement) {
      const root = createRoot(rootElement);
      root.render(
        React.createElement(BrowserRouter, null, React.createElement(App))
      );
    } else {
      console.error('Root element not found');
    }
  } catch (err) {
    console.error('Failed to initialize TensorFlow backend:', err);
    // Try fallback to CPU as last resort
    try {
      await tf.setBackend('cpu');
      console.warn(
        'Fallback to CPU backend. Performance will be severely limited.'
      );

      // Still try to render React app
      const rootElement = document.getElementById('root');
      if (rootElement) {
        const root = createRoot(rootElement);
        root.render(
          React.createElement(BrowserRouter, null, React.createElement(App))
        );
      }
    } catch (cpuErr) {
      console.error('Failed to initialize any TensorFlow backend:', cpuErr);
    }
  }
}

// Start initialization
initialize().catch((err) => {
  console.error('Fatal error during initialization:', err);
});
