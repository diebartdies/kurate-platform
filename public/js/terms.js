/**
 * Terms & Conditions acceptance — disabled for now.
 * Re-enable age-gate UI + POST /api/v1/terms/accept when the legal flow ships.
 * Full legal text was previously rendered here; restore from git history if needed.
 */

export function hasAcceptedTerms() {
  return true;
}

export function recordAcceptance() {
  /* noop */
}

export function openFullTermsModal() {
  /* noop */
}

export function openAgeGateAcceptance({ onAccept } = {}) {
  if (typeof onAccept === 'function') onAccept();
}
