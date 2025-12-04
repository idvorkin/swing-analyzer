/**
 * Exercise Registry
 *
 * Central registry for all exercise definitions.
 * Provides factory functions to get exercise definitions by type.
 */

import { ExerciseType, type ExerciseDefinition } from '../types/exercise';
import { kettlebellSwingDefinition } from './kettlebellSwing';
import { pistolSquatDefinition } from './pistolSquat';
import { pullUpDefinition } from './pullUp';

/**
 * Registry of all available exercise definitions
 */
export const exerciseRegistry: Record<ExerciseType, ExerciseDefinition> = {
  [ExerciseType.KettlebellSwing]: kettlebellSwingDefinition,
  [ExerciseType.PullUp]: pullUpDefinition,
  [ExerciseType.PistolSquat]: pistolSquatDefinition,
};

/**
 * Get an exercise definition by type
 *
 * @param type - The exercise type
 * @returns The exercise definition
 * @throws Error if exercise type is not found
 */
export function getExerciseDefinition(type: ExerciseType): ExerciseDefinition {
  const definition = exerciseRegistry[type];
  if (!definition) {
    throw new Error(`Unknown exercise type: ${type}`);
  }
  return definition;
}

/**
 * Get all available exercise types
 */
export function getAvailableExercises(): ExerciseType[] {
  return Object.keys(exerciseRegistry) as ExerciseType[];
}

/**
 * Get exercise definition by string name (case-insensitive)
 *
 * @param name - Exercise name or type string
 * @returns The exercise definition or undefined if not found
 */
export function getExerciseByName(name: string): ExerciseDefinition | undefined {
  const normalizedName = name.toLowerCase().replace(/[\s-_]/g, '');

  for (const definition of Object.values(exerciseRegistry)) {
    const normalizedType = definition.type.toLowerCase().replace(/[\s-_]/g, '');
    const normalizedDisplayName = definition.name.toLowerCase().replace(/[\s-_]/g, '');

    if (normalizedName === normalizedType || normalizedName === normalizedDisplayName) {
      return definition;
    }
  }

  return undefined;
}

/**
 * Check if an exercise type is supported
 */
export function isExerciseSupported(type: ExerciseType): boolean {
  return type in exerciseRegistry;
}

// Re-export individual definitions for direct import
export { kettlebellSwingDefinition } from './kettlebellSwing';
export { pullUpDefinition } from './pullUp';
export { pistolSquatDefinition } from './pistolSquat';
