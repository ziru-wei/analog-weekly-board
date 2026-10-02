import type { BoardDocument } from './model';
import onboarding from './onboarding.json';

// Snapshot of the authored localhost board. Only used for first-time users.
export function createDemo(): BoardDocument {
  return structuredClone(onboarding) as BoardDocument;
}
