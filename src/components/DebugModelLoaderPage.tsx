import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as tf from '@tensorflow/tfjs-core';
import '@tensorflow/tfjs-backend-webgl'; // Ensures WebGL backend is registered
import * as poseDetection from '@tensorflow-models/pose-detection';

const DebugModelLoaderPage: React.FC = () => {
  console.log('DebugModelLoaderPage: Component rendering started.');
  const [status, setStatus] = useState<string>('Idle. Click a button to load the model.');
  const [tfReady, setTfReady] = useState<boolean>(false);

  useEffect(() => {
    async function initializeTf() {
      if (tfReady) return;
      try {
        setStatus('Initializing TensorFlow.js...');
        console.log('DebugPage: Initializing TensorFlow.js...');
        // Ensure backend is set. This might be redundant if src/index.ts handles it robustly,
        // but it's good for an isolated test page.
        if (tf.getBackend() !== 'webgl') {
            await tf.setBackend('webgl');
        }
        await tf.ready();
        setTfReady(true);
        setStatus('TensorFlow.js ready. Backend: ' + tf.getBackend());
        console.log('DebugPage: TensorFlow.js ready. Backend: ' + tf.getBackend());
      } catch (error) {
        console.error('DebugPage: TensorFlow.js initialization error:', error);
        setStatus('Error initializing TensorFlow.js: ' + (error as Error).message);
      }
    }
    initializeTf();
  }, [tfReady]);

  const loadModelWithDefaultUrl = async () => {
    if (!tfReady) {
      setStatus('TensorFlow.js not ready yet. Please wait.');
      return;
    }
    setStatus('Attempting to load model with default URL...');
    console.log('DebugPage: Attempting to load model with default URL...');
    try {
      const detectorConfig: poseDetection.MoveNetModelConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
        // No modelUrl initially, to test default tfhub.dev behavior
      };
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      );
      console.log('DebugPage: SUCCESS: MoveNet detector created successfully using default URL!', detector);
      setStatus('SUCCESS: MoveNet detector created successfully using default URL!');
    } catch (error) {
      console.error('DebugPage: FAILED to load MoveNet with default URL:', error);
      setStatus('FAILED to load MoveNet with default URL: ' + (error as Error).message);
    }
  };

  const loadModelWithLocalUrl = async () => {
    if (!tfReady) {
      setStatus('TensorFlow.js not ready yet. Please wait.');
      return;
    }
    setStatus('Attempting to load model with LOCAL URL... (Ensure files are in public/tfjs-models/movenet-lightning/)');
    console.log('DebugPage: Attempting to load model with LOCAL URL...');
    try {
      const detectorConfig: poseDetection.MoveNetModelConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
        modelUrl: '/tfjs-models/movenet-lightning/model.json', // Path for self-hosted model
      };
      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      );
      console.log('DebugPage: SUCCESS: MoveNet detector created successfully using LOCAL URL!', detector);
      setStatus('SUCCESS: MoveNet detector created successfully using LOCAL URL!');
    } catch (error) {
      console.error('DebugPage: FAILED to load MoveNet with LOCAL URL:', error);
      setStatus('FAILED to load MoveNet with LOCAL URL: ' + (error as Error).message);
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <h1>Debug MoveNet Loader (React Component)</h1>
      <p><Link to="/">Back to Main App</Link></p>
      <hr />
      <div>
        <p><strong>Status:</strong> {status}</p>
        <button onClick={loadModelWithDefaultUrl} disabled={!tfReady} style={{ marginRight: '10px' }}>
          Load Model (Default TFHub URL)
        </button>
        <button onClick={loadModelWithLocalUrl} disabled={!tfReady}>
          Load Model (Local /tfjs-models/ URL)
        </button>
      </div>
      <hr />
      <p><em>Check the browser console for detailed logs.</em></p>
      <p><em>Ensure TensorFlow.js is initialized before attempting to load models. Current TF Status: {tfReady ? 'Ready' : 'Not Ready'}</em></p>
    </div>
  );
};

export default DebugModelLoaderPage; 