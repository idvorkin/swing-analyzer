import { useEffect, useRef, useState } from 'react';
import { Button, Stack, Text, Paper, Group, Code, ScrollArea } from '@mantine/core';
import { createPipeline } from '../pipeline/PipelineFactory';
import type { Pipeline } from '../pipeline/Pipeline';
import { SkeletonRenderer } from '../viewmodels/SkeletonRenderer';
import type { SkeletonEvent } from '../pipeline/PipelineInterfaces';

interface DebugLog {
  timestamp: number;
  modelType: string;
  keypointsDetected: number;
  visibleKeypoints: number;
  sampleKeypoints: Array<{ index: number; name: string; x: number; y: number; z?: number; score?: number; visibility?: number }>;
  spineAngle: number;
  armAngle: number;
  hasRequiredKeypoints: boolean;
}

export function DebugPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const skeletonRendererRef = useRef<SkeletonRenderer | null>(null);
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [currentModel, setCurrentModel] = useState<'BlazePose' | 'MoveNet'>('BlazePose');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [status, setStatus] = useState('Initializing...');

  // Initialize pipeline
  useEffect(() => {
    const init = async () => {
      if (!videoRef.current || !canvasRef.current) return;

      try {
        const pipeline = createPipeline(videoRef.current, canvasRef.current);
        pipelineRef.current = pipeline;

        const renderer = new SkeletonRenderer(canvasRef.current);
        skeletonRendererRef.current = renderer;

        await pipeline.initialize();

        // Set initial model type
        const modelType = pipeline.getModelType();
        const modelName = modelType.includes('BlazePose') ? 'BlazePose' : 'MoveNet';
        renderer.setModelType(modelName);
        setCurrentModel(modelName);
        setIsInitialized(true);
        setStatus('Ready. Load video to start.');
      } catch (error) {
        console.error('Failed to initialize pipeline:', error);
        setStatus(`Error: ${error}`);
      }
    };

    init();
  }, []);

  // Subscribe to skeleton events for debugging - only when video is loaded
  useEffect(() => {
    if (!pipelineRef.current || !isInitialized || !isProcessing) return;

    const subscription = pipelineRef.current.getSkeletonEvents().subscribe({
      next: (skeletonEvent: SkeletonEvent) => {
        if (!skeletonEvent.skeleton) return;

        const skeleton = skeletonEvent.skeleton;
        const keypoints = skeleton.getKeypoints();

        // Count visible keypoints
        const visibleKeypoints = keypoints.filter(kp => {
          if (!kp) return false;
          const score = kp.score !== undefined ? kp.score : kp.visibility !== undefined ? kp.visibility : 0;
          return score > 0.2;
        });

        // Sample important keypoints for debugging
        const importantIndices = [0, 5, 6, 11, 12]; // COCO indices for nose, shoulders, hips
        const sampleKeypoints = importantIndices.map(index => ({
          index,
          name: getKeypointName(index, currentModel),
          x: Math.round(keypoints[index]?.x || 0),
          y: Math.round(keypoints[index]?.y || 0),
          z: keypoints[index]?.z ? Math.round(keypoints[index].z * 1000) / 1000 : undefined,
          score: keypoints[index]?.score,
          visibility: keypoints[index]?.visibility
        }));

        const log: DebugLog = {
          timestamp: performance.now(),
          modelType: currentModel,
          keypointsDetected: keypoints.length,
          visibleKeypoints: visibleKeypoints.length,
          sampleKeypoints,
          spineAngle: Math.round(skeleton.getSpineAngle() * 10) / 10,
          armAngle: Math.round(skeleton.getArmToVerticalAngle() * 10) / 10,
          hasRequiredKeypoints: skeleton.hasRequiredKeypoints()
        };

        setLogs(prev => [...prev.slice(-49), log]); // Keep last 50 logs

        // Render skeleton
        if (skeletonRendererRef.current) {
          skeletonRendererRef.current.renderSkeleton(skeleton, performance.now());
        }
      }
    });

    pipelineRef.current.start();

    return () => {
      subscription.unsubscribe();
      if (pipelineRef.current) {
        pipelineRef.current.stop();
      }
    };
  }, [currentModel, isProcessing, isInitialized]);

  const switchModel = async (modelType: 'BlazePose' | 'MoveNet') => {
    if (!pipelineRef.current || !skeletonRendererRef.current) return;

    setIsProcessing(false);
    await pipelineRef.current.switchModel(modelType);
    skeletonRendererRef.current.setModelType(modelType);
    setCurrentModel(modelType);
    setLogs([]); // Clear logs when switching models
    setIsProcessing(true);
  };

  const loadVideo = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    video.src = '/videos/swing-sample.mp4';
    video.loop = false; // Play once, not forever
    video.muted = true;

    // Wait for video to be ready
    await new Promise<void>((resolve) => {
      video.onloadeddata = () => resolve();
    });

    await video.play();
    setIsProcessing(true);
    setStatus('Processing video...');
  };

  const downloadLogs = () => {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = Math.floor(performance.now());
    a.download = `debug-logs-${currentModel}-${timestamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ padding: '20px' }}>
      <Stack gap="md">
        <Text size="xl" fw={700}>Debug Page - Model Testing</Text>
        <Text size="sm" c={status.includes('Error') ? 'red' : 'dimmed'}>{status}</Text>
        {!isInitialized && <Text size="sm" c="orange">Waiting for pipeline to initialize...</Text>}

        <Group>
          <Button onClick={loadVideo} disabled={!isInitialized}>Load Sample Video</Button>
          <Button
            onClick={() => switchModel('BlazePose')}
            color={currentModel === 'BlazePose' ? 'green' : 'gray'}
          >
            BlazePose
          </Button>
          <Button
            onClick={() => switchModel('MoveNet')}
            color={currentModel === 'MoveNet' ? 'green' : 'gray'}
          >
            MoveNet
          </Button>
          <Button onClick={downloadLogs} disabled={logs.length === 0}>
            Download Logs ({logs.length})
          </Button>
        </Group>

        <Group align="start" gap="md">
          <Paper p="md" withBorder style={{ flex: 1 }}>
            <Text fw={700} mb="sm">Video & Canvas</Text>
            <div style={{ position: 'relative' }}>
              <video
                ref={videoRef}
                style={{ width: '100%', maxWidth: '400px' }}
                muted
                loop
              />
              <canvas
                ref={canvasRef}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  maxWidth: '400px',
                  pointerEvents: 'none'
                }}
              />
            </div>
          </Paper>

          <Paper p="md" withBorder style={{ flex: 1 }}>
            <Text fw={700} mb="sm">Latest Debug Info</Text>
            {logs.length > 0 && (
              <Stack gap="xs">
                <Text size="sm">Model: <Code>{logs[logs.length - 1].modelType}</Code></Text>
                <Text size="sm">Keypoints Detected: <Code>{logs[logs.length - 1].keypointsDetected}</Code></Text>
                <Text size="sm">Visible Keypoints: <Code>{logs[logs.length - 1].visibleKeypoints}</Code></Text>
                <Text size="sm">Spine Angle: <Code>{logs[logs.length - 1].spineAngle}°</Code></Text>
                <Text size="sm">Arm Angle: <Code>{logs[logs.length - 1].armAngle}°</Code></Text>
                <Text size="sm">Has Required: <Code>{logs[logs.length - 1].hasRequiredKeypoints ? 'Yes' : 'No'}</Code></Text>

                <Text size="sm" fw={700} mt="md">Sample Keypoints:</Text>
                <ScrollArea h={200}>
                  <Code block>
                    {JSON.stringify(logs[logs.length - 1].sampleKeypoints, null, 2)}
                  </Code>
                </ScrollArea>
              </Stack>
            )}
          </Paper>
        </Group>

        <Paper p="md" withBorder>
          <Text fw={700} mb="sm">Recent Logs (last 10)</Text>
          <ScrollArea h={300}>
            <Code block>
              {JSON.stringify(logs.slice(-10), null, 2)}
            </Code>
          </ScrollArea>
        </Paper>
      </Stack>
    </div>
  );
}

function getKeypointName(index: number, model: 'BlazePose' | 'MoveNet'): string {
  if (model === 'MoveNet') {
    const cocoNames = ['nose', 'leftEye', 'rightEye', 'leftEar', 'rightEar',
                       'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
                       'leftWrist', 'rightWrist', 'leftHip', 'rightHip',
                       'leftKnee', 'rightKnee', 'leftAnkle', 'rightAnkle'];
    return cocoNames[index] || `unknown-${index}`;
  } else {
    const mediaPipeNames = ['nose', 'leftEyeInner', 'leftEye', 'leftEyeOuter',
                            'rightEyeInner', 'rightEye', 'rightEyeOuter',
                            'leftEar', 'rightEar', 'mouthLeft', 'mouthRight',
                            'leftShoulder', 'rightShoulder', 'leftElbow', 'rightElbow',
                            'leftWrist', 'rightWrist', 'leftPinky', 'rightPinky',
                            'leftIndex', 'rightIndex', 'leftThumb', 'rightThumb',
                            'leftHip', 'rightHip', 'leftKnee', 'rightKnee',
                            'leftAnkle', 'rightAnkle', 'leftHeel', 'rightHeel',
                            'leftFootIndex', 'rightFootIndex'];
    return mediaPipeNames[index] || `unknown-${index}`;
  }
}
