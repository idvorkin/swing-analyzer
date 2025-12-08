/**
 * Shared constants for Rep Gallery Widget and Modal
 */

/** Display order for swing position phases (default, used for reset) */
export const PHASE_ORDER = ['bottom', 'release', 'top', 'connect'] as const;

/** Display order for pistol squat phases */
export const PISTOL_SQUAT_PHASE_ORDER = ['standing', 'descending', 'bottom', 'ascending'] as const;

/** All known phase orders by exercise type */
const PHASE_ORDERS: Record<string, readonly string[]> = {
  'kettlebell-swing': PHASE_ORDER,
  'pistol-squat': PISTOL_SQUAT_PHASE_ORDER,
};

/** Human-readable labels for each phase */
export const PHASE_LABELS: Record<string, string> = {
  // Kettlebell swing phases
  top: 'Top',
  connect: 'Connect',
  bottom: 'Bottom',  // Shared with pistol squat
  release: 'Release',
  // Pistol squat phases
  standing: 'Standing',
  descending: 'Descending',
  ascending: 'Ascending',
};

/** Sort phases by known order, falling back to alphabetical */
export function sortPhases(phases: string[]): string[] {
  // Find which exercise's phase order matches
  let knownOrder: readonly string[] | undefined;
  for (const order of Object.values(PHASE_ORDERS)) {
    if (phases.some(p => order.includes(p))) {
      knownOrder = order;
      break;
    }
  }

  return phases.sort((a, b) => {
    if (knownOrder) {
      const aIdx = knownOrder.indexOf(a);
      const bIdx = knownOrder.indexOf(b);
      if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
      if (aIdx !== -1) return -1;
      if (bIdx !== -1) return 1;
    }
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
