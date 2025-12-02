/**
 * PoseExtractor Service Tests
 *
 * Tests for utility functions in PoseExtractor.
 * Note: Full integration tests for extractPosesFromVideo require mocking
 * TensorFlow, Web Crypto API, and the DOM.
 */

import { describe, expect, it } from 'vitest';
import type { PoseModel } from '../types/posetrack';
import { getModelDisplayName } from './PoseExtractor';

describe('PoseExtractor', () => {
  describe('getModelDisplayName', () => {
    it('returns correct display name for movenet-lightning', () => {
      expect(getModelDisplayName('movenet-lightning')).toBe(
        'MoveNet Lightning'
      );
    });

    it('returns correct display name for movenet-thunder', () => {
      expect(getModelDisplayName('movenet-thunder')).toBe('MoveNet Thunder');
    });

    it('returns correct display name for blazepose', () => {
      expect(getModelDisplayName('blazepose')).toBe('BlazePose');
    });

    it('returns the input model name for unknown models', () => {
      // Cast to PoseModel to test the default case
      expect(getModelDisplayName('unknown-model' as PoseModel)).toBe(
        'unknown-model'
      );
    });

    it('handles all valid PoseModel values', () => {
      const models: PoseModel[] = [
        'movenet-lightning',
        'movenet-thunder',
        'blazepose',
      ];

      for (const model of models) {
        const displayName = getModelDisplayName(model);
        expect(displayName).toBeTruthy();
        expect(typeof displayName).toBe('string');
        // Display name should be different from the raw model ID
        expect(displayName).not.toBe(model);
      }
    });
  });
});
