/**
 * Shared constants for Rep Gallery Widget and Modal
 */

/** Display order for swing position phases */
export const PHASE_ORDER = ['bottom', 'release', 'top', 'connect'] as const;

/** Human-readable labels for each phase */
export const PHASE_LABELS: Record<string, string> = {
  // Kettlebell swing phases
  top: 'Top',
  connect: 'Connect',
  bottom: 'Bottom',
  release: 'Release',
  // Pistol squat phases
  standing: 'Standing',
  descending: 'Descending',
  ascending: 'Ascending',
};

/** Sort phases by known order, falling back to alphabetical */
export function sortPhases(phases: string[]): string[] {
  return phases.sort((a, b) => {
    const aIdx = PHASE_ORDER.indexOf(a as typeof PHASE_ORDER[number]);
    const bIdx = PHASE_ORDER.indexOf(b as typeof PHASE_ORDER[number]);
    if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
    if (aIdx !== -1) return -1;
    if (bIdx !== -1) return 1;
    return a.localeCompare(b);
  });
}

/** Get sorted rep numbers from a repThumbnails map */
export function getSortedRepNumbers(repThumbnails: Map<number, unknown>): number[] {
  return Array.from(repThumbnails.keys()).sort((a, b) => a - b);
}

/** Get unique phase names from repThumbnails, sorted */
export function getPhaseNames(repThumbnails: Map<number, Map<string, unknown>>): string[] {
  const phases = new Set<string>();
  for (const positions of repThumbnails.values()) {
    for (const posName of positions.keys()) {
      phases.add(posName);
    }
  }
  return sortPhases(Array.from(phases));
}
