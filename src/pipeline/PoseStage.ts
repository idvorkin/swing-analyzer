import * as poseDetection from '@tensorflow-models/pose-detection';
import '@tensorflow/tfjs-backend-webgl';
import * as tf from '@tensorflow/tfjs-core';
import { PoseResult } from '../types';
import { PoseDetection, FrameEvent, PoseEvent } from './PipelineInterfaces';
import { Observable, from, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

/**
 * Pose detection stage - detects poses from frames using TensorFlow.js models
 */
export class PoseStage implements PoseDetection {
  private detector: poseDetection.PoseDetector | null = null;

  /**
   * Initialize the pose detector model
   */
  async initialize(): Promise<void> {
    try {
      await tf.setBackend('webgl');
      console.log(`Using TensorFlow.js backend: ${tf.getBackend()}`);
      
      // Configure TensorFlow.js for better performance
      tf.env().set('WEBGL_CPU_FORWARD', false);
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
      
      // Use MoveNet - better performance on mobile
      const detectorConfig = {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING,
        enableSmoothing: true,
      };
      
      this.detector = await poseDetection.createDetector(
        poseDetection.SupportedModels.MoveNet, 
        detectorConfig
      );
      
      console.log("Pose detector initialized successfully");
    } catch (error) {
      console.error("Failed to initialize primary model:", error);
      
      // Try a fallback model
      try {
        this.detector = await poseDetection.createDetector(
          poseDetection.SupportedModels.PoseNet
        );
        console.log("Fallback model initialized");
      } catch (fallbackError) {
        console.error("Failed to initialize fallback model:", fallbackError);
        throw new Error("Could not initialize any pose detection model");
      }
    }
  }
  
  /**
   * Detect pose from a frame event
   * Returns an Observable that emits the pose result
   */
  detectPose(frameEvent: FrameEvent): Observable<PoseEvent> {
    if (!this.detector) {
      console.warn("Pose detector not initialized");
      return of({
        pose: null,
        frameEvent
      });
    }
    
    // Convert the Promise-based detection to an Observable
    return from(this.detector.estimatePoses(frameEvent.frame)).pipe(
      map(poses => {
        if (poses.length === 0) {
          return {
            pose: null,
            frameEvent
          };
        }
        
        // Use the first detected pose (we're focused on single person)
        const pose = poses[0];
        
        return {
          pose: {
            keypoints: pose.keypoints,
            score: pose.score
          },
          frameEvent
        };
      }),
      catchError(error => {
        console.error("Error detecting pose:", error);
        return of({
          pose: null,
          frameEvent
        });
      })
    );
  }
  
  /**
   * Check if detector is initialized
   */
  isInitialized(): boolean {
    return this.detector !== null;
  }
} 