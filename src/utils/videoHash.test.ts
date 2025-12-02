import { describe, expect, it } from 'vitest';
import { isValidSha256Hash, truncateHash } from './videoHash';

// Note: computeVideoHash and computeQuickVideoHash require Web Crypto API
// which isn't available in Node.js by default. These tests cover the
// synchronous utility functions. Integration tests would test the hash functions.

describe('videoHash utilities', () => {
  describe('isValidSha256Hash', () => {
    it('returns true for valid SHA-256 hash (lowercase)', () => {
      const validHash = 'a'.repeat(64);
      expect(isValidSha256Hash(validHash)).toBe(true);
    });

    it('returns true for valid SHA-256 hash (uppercase)', () => {
      const validHash = 'A'.repeat(64);
      expect(isValidSha256Hash(validHash)).toBe(true);
    });

    it('returns true for valid SHA-256 hash (mixed case)', () => {
      const validHash = 'aB'.repeat(32);
      expect(isValidSha256Hash(validHash)).toBe(true);
    });

    it('returns true for valid SHA-256 hash with numbers', () => {
      const validHash = '0123456789abcdef'.repeat(4);
      expect(isValidSha256Hash(validHash)).toBe(true);
    });

    it('returns false for hash with wrong length', () => {
      expect(isValidSha256Hash('a'.repeat(63))).toBe(false); // Too short
      expect(isValidSha256Hash('a'.repeat(65))).toBe(false); // Too long
      expect(isValidSha256Hash('a'.repeat(32))).toBe(false); // SHA-128 length
    });

    it('returns false for hash with invalid characters', () => {
      const invalidHash = 'g'.repeat(64); // 'g' is not hex
      expect(isValidSha256Hash(invalidHash)).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isValidSha256Hash('')).toBe(false);
    });

    it('returns false for hash with spaces', () => {
      const hashWithSpaces = `${'a'.repeat(32)} ${'a'.repeat(31)}`;
      expect(isValidSha256Hash(hashWithSpaces)).toBe(false);
    });
  });

  describe('truncateHash', () => {
    it('truncates long hash to default length', () => {
      const hash = 'abcdef1234567890'.repeat(4);
      const truncated = truncateHash(hash);
      expect(truncated).toBe('abcdef12...');
      expect(truncated.length).toBe(11); // 8 chars + '...'
    });

    it('truncates to custom length', () => {
      const hash = 'abcdef1234567890'.repeat(4);
      const truncated = truncateHash(hash, 4);
      expect(truncated).toBe('abcd...');
    });

    it('returns original hash if shorter than truncate length', () => {
      const shortHash = 'abcd';
      expect(truncateHash(shortHash, 8)).toBe('abcd');
    });

    it('returns original hash if equal to truncate length', () => {
      const hash = 'abcdefgh';
      expect(truncateHash(hash, 8)).toBe('abcdefgh');
    });

    it('handles empty string', () => {
      expect(truncateHash('', 8)).toBe('');
    });
  });
});
