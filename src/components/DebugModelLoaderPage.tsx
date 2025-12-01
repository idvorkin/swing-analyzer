import * as tf from '@tensorflow/tfjs-core';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import '@tensorflow/tfjs-backend-webgl';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { useSwingAnalyzerContext } from '../contexts/SwingAnalyzerContext';

interface LogEntry {
  timestamp: string;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

const DebugModelLoaderPage: React.FC = () => {
  const [status, setStatus] = useState<string>(
    'Idle. Click a button to load the model.'
  );
  const [tfReady, setTfReady] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // Get video/processing context from main app
  const {
    videoRef,
    canvasRef,
    appState,
    isPlaying,
    loadHardcodedVideo,
    togglePlayPause,
    stopVideo,
  } = useSwingAnalyzerContext();

  // Add a log entry
  const addLog = useCallback((level: LogEntry['level'], ...args: unknown[]) => {
    const safeStringify = (obj: unknown): string => {
      if (typeof obj !== 'object' || obj === null) {
        return String(obj);
      }
      try {
        return JSON.stringify(obj, null, 2);
      } catch {
        // Handle circular references
        return `[Object: ${obj.constructor?.name || 'unknown'}]`;
      }
    };
    const message = args.map(safeStringify).join(' ');
    const timestamp = new Date().toISOString().split('T')[1].slice(0, 12);
    setLogs((prev) => [...prev, { timestamp, level, message }]);
  }, []);

  // Intercept console methods
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    console.log = (...args) => {
      originalLog(...args);
      addLog('log', ...args);
    };
    console.warn = (...args) => {
      originalWarn(...args);
      addLog('warn', ...args);
    };
    console.error = (...args) => {
      originalError(...args);
      addLog('error', ...args);
    };
    console.info = (...args) => {
      originalInfo(...args);
      addLog('info', ...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
      console.info = originalInfo;
    };
  }, [addLog]);

  // Auto-scroll logs when new entries are added
  const logsLength = logs.length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: logsLength is intentionally used to trigger scroll on new logs
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logsLength]);

  // Initialize TensorFlow
  useEffect(() => {
    async function initializeTf() {
      if (tfReady) return;
      try {
        setStatus('Initializing TensorFlow.js...');
        console.log('DebugPage: Initializing TensorFlow.js...');
        if (tf.getBackend() !== 'webgl') {
          await tf.setBackend('webgl');
        }
        await tf.ready();
        setTfReady(true);
        setStatus(`TensorFlow.js ready. Backend: ${tf.getBackend()}`);
        console.log(
          `DebugPage: TensorFlow.js ready. Backend: ${tf.getBackend()}`
        );
      } catch (error) {
        console.error('DebugPage: TensorFlow.js initialization error:', error);
        setStatus(
          `Error initializing TensorFlow.js: ${(error as Error).message}`
        );
      }
    }
    initializeTf();
  }, [tfReady]);

  const loadBlazePose = async () => {
    if (!tfReady) {
      setStatus('TensorFlow.js not ready yet. Please wait.');
      return;
    }
    setStatus('Attempting to load BlazePose model...');
    console.log('DebugPage: Attempting to load BlazePose model...');
    try {
      // Configure TensorFlow.js for better performance
      tf.env().set('WEBGL_CPU_FORWARD', false);
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
      console.log('DebugPage: TF env flags set for BlazePose');

      const detectorConfig: poseDetection.BlazePoseTfjsModelConfig = {
        runtime: 'tfjs',
        modelType: 'lite',
        enableSmoothing: true,
      };
      console.log('DebugPage: BlazePose config:', detectorConfig);

      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.BlazePose,
        detectorConfig
      );
      console.log('DebugPage: SUCCESS: BlazePose detector created!', detector);
      setStatus('SUCCESS: BlazePose detector created!');
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('DebugPage: FAILED to load BlazePose:', errorMsg);
      console.error('DebugPage: BlazePose error stack:', errorStack);
      console.error('DebugPage: BlazePose raw error:', error);
      setStatus(`FAILED to load BlazePose: ${errorMsg}`);
    }
  };

  const loadMoveNet = async () => {
    if (!tfReady) {
      setStatus('TensorFlow.js not ready yet. Please wait.');
      return;
    }
    setStatus('Attempting to load MoveNet Thunder model...');
    console.log('DebugPage: Attempting to load MoveNet Thunder model...');
    try {
      const detectorConfig: poseDetection.MoveNetModelConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
        enableSmoothing: true,
      };
      console.log('DebugPage: MoveNet config:', detectorConfig);

      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet,
        detectorConfig
      );
      console.log('DebugPage: SUCCESS: MoveNet detector created!', detector);
      setStatus('SUCCESS: MoveNet Thunder detector created!');
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('DebugPage: FAILED to load MoveNet:', errorMsg);
      console.error('DebugPage: MoveNet error stack:', errorStack);
      console.error('DebugPage: MoveNet raw error:', error);
      setStatus(`FAILED to load MoveNet: ${errorMsg}`);
    }
  };

  const loadPoseNet = async () => {
    if (!tfReady) {
      setStatus('TensorFlow.js not ready yet. Please wait.');
      return;
    }
    setStatus('Attempting to load PoseNet model...');
    console.log('DebugPage: Attempting to load PoseNet model...');
    try {
      const detectorConfig: poseDetection.PosenetModelConfig = {
        architecture: 'MobileNetV1',
        outputStride: 16,
        inputResolution: { width: 640, height: 480 },
        multiplier: 0.75,
      };
      console.log('DebugPage: PoseNet config:', detectorConfig);

      const detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.PoseNet,
        detectorConfig
      );
      console.log('DebugPage: SUCCESS: PoseNet detector created!', detector);
      setStatus('SUCCESS: PoseNet detector created!');
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : JSON.stringify(error);
      const errorStack = error instanceof Error ? error.stack : '';
      console.error('DebugPage: FAILED to load PoseNet:', errorMsg);
      console.error('DebugPage: PoseNet error stack:', errorStack);
      console.error('DebugPage: PoseNet raw error:', error);
      setStatus(`FAILED to load PoseNet: ${errorMsg}`);
    }
  };

  const copyLogs = () => {
    const logText = logs
      .map(
        (log) =>
          `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`
      )
      .join('\n');
    navigator.clipboard.writeText(logText).then(() => {
      setStatus('Logs copied to clipboard!');
    });
  };

  const clearLogs = () => {
    setLogs([]);
    setStatus('Logs cleared.');
  };

  const getLogColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return '#ff6b6b';
      case 'warn':
        return '#ffd93d';
      case 'info':
        return '#6bcfff';
      default:
        return '#ffffff';
    }
  };

  return (
    <div style={{ padding: '20px', fontFamily: 'system-ui, sans-serif' }}>
      <h1>Debug Model Loader</h1>
      <p style={{ color: '#888', fontSize: '12px' }}>
        Last updated: {new Date().toISOString()} (Build:
        2025-12-01-v6-throttled-logs)
      </p>
      <p>
        <Link to="/">Back to Main App</Link>
      </p>
      <hr />

      <div style={{ marginBottom: '20px' }}>
        <p>
          <strong>Status:</strong> {status}
        </p>
        <p>
          <strong>TensorFlow.js:</strong>{' '}
          {tfReady ? `Ready (${tf.getBackend()})` : 'Not Ready'}
        </p>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <h3>Load Models</h3>
        <button
          type="button"
          onClick={loadBlazePose}
          disabled={!tfReady}
          style={{
            marginRight: '10px',
            padding: '10px 15px',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: tfReady ? 'pointer' : 'not-allowed',
          }}
        >
          Load BlazePose (33 keypoints)
        </button>
        <button
          type="button"
          onClick={loadMoveNet}
          disabled={!tfReady}
          style={{
            marginRight: '10px',
            padding: '10px 15px',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: tfReady ? 'pointer' : 'not-allowed',
          }}
        >
          Load MoveNet Thunder
        </button>
        <button
          type="button"
          onClick={loadPoseNet}
          disabled={!tfReady}
          style={{
            padding: '10px 15px',
            backgroundColor: '#9C27B0',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: tfReady ? 'pointer' : 'not-allowed',
          }}
        >
          Load PoseNet (fallback)
        </button>
      </div>

      <hr />

      <div style={{ marginBottom: '20px' }}>
        <h3>Video Processing Test</h3>
        <p style={{ color: '#666', fontSize: '12px', marginBottom: '10px' }}>
          Model loaded: {appState.isModelLoaded ? 'Yes' : 'No'} | Processing:{' '}
          {appState.isProcessing ? 'Yes' : 'No'}
        </p>
        <div style={{ marginBottom: '10px' }}>
          <button
            type="button"
            onClick={loadHardcodedVideo}
            style={{
              marginRight: '10px',
              padding: '10px 15px',
              backgroundColor: '#FF9800',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            Load Sample Video
          </button>
          <button
            type="button"
            onClick={togglePlayPause}
            disabled={!appState.isModelLoaded}
            style={{
              marginRight: '10px',
              padding: '10px 15px',
              backgroundColor: isPlaying ? '#f44336' : '#4CAF50',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: appState.isModelLoaded ? 'pointer' : 'not-allowed',
            }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>
          <button
            type="button"
            onClick={stopVideo}
            disabled={!appState.isModelLoaded}
            style={{
              padding: '10px 15px',
              backgroundColor: '#607D8B',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: appState.isModelLoaded ? 'pointer' : 'not-allowed',
            }}
          >
            Stop
          </button>
        </div>
        <div
          style={{
            position: 'relative',
            width: '400px',
            height: '300px',
            backgroundColor: '#000',
          }}
        >
          <video
            ref={videoRef}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            playsInline
            muted
          />
          <canvas
            ref={canvasRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
            }}
          />
        </div>
      </div>

      <hr />

      <div style={{ marginBottom: '10px' }}>
        <h3>Console Logs</h3>
        <button
          type="button"
          onClick={copyLogs}
          style={{
            marginRight: '10px',
            padding: '8px 12px',
            backgroundColor: '#607D8B',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Copy Logs
        </button>
        <button
          type="button"
          onClick={clearLogs}
          style={{
            padding: '8px 12px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
        >
          Clear Logs
        </button>
      </div>

      <div
        ref={logContainerRef}
        style={{
          backgroundColor: '#1e1e1e',
          color: '#ffffff',
          padding: '15px',
          borderRadius: '8px',
          height: '400px',
          overflowY: 'auto',
          fontFamily: 'Monaco, Consolas, monospace',
          fontSize: '12px',
          lineHeight: '1.5',
        }}
      >
        {logs.length === 0 ? (
          <div style={{ color: '#666' }}>
            No logs yet. Click a button above to start.
          </div>
        ) : (
          logs.map((log, index) => (
            <div
              key={`${log.timestamp}-${index}`}
              style={{ marginBottom: '4px' }}
            >
              <span style={{ color: '#888' }}>[{log.timestamp}]</span>{' '}
              <span
                style={{ color: getLogColor(log.level), fontWeight: 'bold' }}
              >
                [{log.level.toUpperCase()}]
              </span>{' '}
              <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                {log.message}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default DebugModelLoaderPage;
