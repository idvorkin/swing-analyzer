import { describe, expect, it } from 'vitest';
import {
  buildCheckpointList,
  findNextCheckpoint,
  findPreviousCheckpoint,
} from './checkpointUtils';
import type { PositionCandidate } from '../types/exercise';

// Helper to create a minimal position candidate for testing
// Only videoTime is needed for checkpoint building
function makeCandidate(videoTime: number): PositionCandidate {
  return {
    position: 'test',
    timestamp: 0,
    videoTime,
    angles: {},
    score: 0,
  };
}

describe('checkpointUtils', () => {
  describe('buildCheckpointList', () => {
    it('builds checkpoints for kettlebell swing phases', () => {
      const repThumbnails = new Map<number, Map<string, PositionCandidate>>();
      const rep1 = new Map<string, PositionCandidate>();
      rep1.set('bottom', makeCandidate(1.0));
      rep1.set('release', makeCandidate(1.5));
      rep1.set('top', makeCandidate(2.0));
      rep1.set('connect', makeCandidate(2.5));
      repThumbnails.set(1, rep1);

      const swingPhases = ['bottom', 'release', 'top', 'connect'];
      const checkpoints = buildCheckpointList(repThumbnails, swingPhases);

      expect(checkpoints).toHaveLength(4);
      expect(checkpoints.map(c => c.position)).toEqual(['bottom', 'release', 'top', 'connect']);
    });

    it('builds checkpoints for pistol squat phases', () => {
      const repThumbnails = new Map<number, Map<string, PositionCandidate>>();
      const rep1 = new Map<string, PositionCandidate>();
      rep1.set('standing', makeCandidate(1.0));
      rep1.set('descending', makeCandidate(2.0));
      rep1.set('bottom', makeCandidate(3.0));
      rep1.set('ascending', makeCandidate(4.0));
      repThumbnails.set(1, rep1);

      const pistolPhases = ['standing', 'descending', 'bottom', 'ascending'];
      const checkpoints = buildCheckpointList(repThumbnails, pistolPhases);

      expect(checkpoints).toHaveLength(4);
      expect(checkpoints.map(c => c.position)).toEqual(['standing', 'descending', 'bottom', 'ascending']);
    });

    it('only includes phases that exist in the provided phases list', () => {
      // This is the bug scenario: if we use swing phases for pistol squat data,
      // we should only get checkpoints for phases that exist in both
      const repThumbnails = new Map<number, Map<string, PositionCandidate>>();
      const rep1 = new Map<string, PositionCandidate>();
      // Pistol squat data
      rep1.set('standing', makeCandidate(1.0));
      rep1.set('descending', makeCandidate(2.0));
      rep1.set('bottom', makeCandidate(3.0));  // 'bottom' exists in both swing and pistol
      rep1.set('ascending', makeCandidate(4.0));
      repThumbnails.set(1, rep1);

      // BUG: Using swing phases for pistol squat data
      const swingPhases = ['bottom', 'release', 'top', 'connect'];
      const checkpoints = buildCheckpointList(repThumbnails, swingPhases);

      // This would only find 'bottom' - the bug!
      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].position).toBe('bottom');

      // FIX: Using correct pistol phases should find all 4
      const pistolPhases = ['standing', 'descending', 'bottom', 'ascending'];
      const correctCheckpoints = buildCheckpointList(repThumbnails, pistolPhases);
      expect(correctCheckpoints).toHaveLength(4);
    });

    it('sorts checkpoints by video time across multiple reps', () => {
      const repThumbnails = new Map<number, Map<string, PositionCandidate>>();

      const rep1 = new Map<string, PositionCandidate>();
      rep1.set('bottom', makeCandidate(1.0));
      rep1.set('top', makeCandidate(2.0));
      repThumbnails.set(1, rep1);

      const rep2 = new Map<string, PositionCandidate>();
      rep2.set('bottom', makeCandidate(3.0));
      rep2.set('top', makeCandidate(4.0));
      repThumbnails.set(2, rep2);

      const phases = ['bottom', 'top'];
      const checkpoints = buildCheckpointList(repThumbnails, phases);

      expect(checkpoints).toHaveLength(4);
      expect(checkpoints.map(c => c.videoTime)).toEqual([1.0, 2.0, 3.0, 4.0]);
      expect(checkpoints.map(c => c.repNum)).toEqual([1, 1, 2, 2]);
    });

    it('handles empty repThumbnails', () => {
      const repThumbnails = new Map<number, Map<string, PositionCandidate>>();
      const phases = ['bottom', 'top'];
      const checkpoints = buildCheckpointList(repThumbnails, phases);

      expect(checkpoints).toHaveLength(0);
    });

    it('handles missing phase in rep', () => {
      const repThumbnails = new Map<number, Map<string, PositionCandidate>>();
      const rep1 = new Map<string, PositionCandidate>();
      rep1.set('bottom', makeCandidate(1.0));
      // 'top' is missing
      repThumbnails.set(1, rep1);

      const phases = ['bottom', 'top'];
      const checkpoints = buildCheckpointList(repThumbnails, phases);

      expect(checkpoints).toHaveLength(1);
      expect(checkpoints[0].position).toBe('bottom');
    });
  });

  describe('findNextCheckpoint', () => {
    const checkpoints = [
      { repNum: 1, position: 'bottom', videoTime: 1.0 },
      { repNum: 1, position: 'top', videoTime: 2.0 },
      { repNum: 2, position: 'bottom', videoTime: 3.0 },
      { repNum: 2, position: 'top', videoTime: 4.0 },
    ];

    it('finds the next checkpoint after current time', () => {
      const next = findNextCheckpoint(checkpoints, 1.5);
      expect(next?.videoTime).toBe(2.0);
      expect(next?.position).toBe('top');
    });

    it('returns undefined when at the last checkpoint', () => {
      const next = findNextCheckpoint(checkpoints, 4.0);
      expect(next).toBeUndefined();
    });

    it('skips checkpoint at exactly current time (with tolerance)', () => {
      const next = findNextCheckpoint(checkpoints, 1.0);
      expect(next?.videoTime).toBe(2.0);
    });
  });

  describe('findPreviousCheckpoint', () => {
    const checkpoints = [
      { repNum: 1, position: 'bottom', videoTime: 1.0 },
      { repNum: 1, position: 'top', videoTime: 2.0 },
      { repNum: 2, position: 'bottom', videoTime: 3.0 },
      { repNum: 2, position: 'top', videoTime: 4.0 },
    ];

    it('finds the previous checkpoint before current time', () => {
      const prev = findPreviousCheckpoint(checkpoints, 2.5);
      expect(prev?.videoTime).toBe(2.0);
      expect(prev?.position).toBe('top');
    });

    it('returns undefined when before the first checkpoint', () => {
      const prev = findPreviousCheckpoint(checkpoints, 0.5);
      expect(prev).toBeUndefined();
    });

    it('goes back one checkpoint when at a checkpoint (with tolerance)', () => {
      const prev = findPreviousCheckpoint(checkpoints, 2.0);
      expect(prev?.videoTime).toBe(1.0);
    });
  });
});
