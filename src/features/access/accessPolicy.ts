import type { AccessSnapshot, AccessState } from './accessContracts';

export type AccessGateStatus =
  | 'CHECKING'
  | AccessState
  | 'NETWORK_ERROR';

const ACCESS_STATES: ReadonlySet<string> = new Set([
  'ACCESS_BLOCKED',
  'FREE_HOUR_ACTIVE',
  'TRIAL_AVAILABLE',
  'LICENSE_REQUIRED',
]);

export function isAccessState(value: unknown): value is AccessState {
  return typeof value === 'string' && ACCESS_STATES.has(value);
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/**
 * Runtime validation for server JSON.
 *
 * The TypeScript type alone cannot protect us from malformed HTTP data.
 * This function never grants access; malformed data is rejected.
 */
export function assertAccessSnapshot(value: unknown): AccessSnapshot {
  if (!value || typeof value !== 'object') {
    throw new Error('INVALID_ACCESS_SNAPSHOT');
  }

  const access = value as Record<string, unknown>;

  if (!isAccessState(access.state)) {
    throw new Error('INVALID_ACCESS_STATE');
  }

  if (typeof access.machine_id !== 'string' || !access.machine_id) {
    throw new Error('INVALID_ACCESS_MACHINE_ID');
  }

  if (typeof access.server_time !== 'string' || !access.server_time) {
    throw new Error('INVALID_ACCESS_SERVER_TIME');
  }

  if (typeof access.first_seen_at !== 'string' || !access.first_seen_at) {
    throw new Error('INVALID_ACCESS_FIRST_SEEN');
  }

  if (typeof access.free_expires_at !== 'string' || !access.free_expires_at) {
    throw new Error('INVALID_ACCESS_FREE_EXPIRES');
  }

  if (!isFiniteNonNegativeNumber(access.free_remaining_seconds)) {
    throw new Error('INVALID_ACCESS_REMAINING_SECONDS');
  }

  if (typeof access.trial_used !== 'boolean') {
    throw new Error('INVALID_ACCESS_TRIAL_USED');
  }

  if (typeof access.trial_eligible !== 'boolean') {
    throw new Error('INVALID_ACCESS_TRIAL_ELIGIBLE');
  }

  if (typeof access.can_use_workspace !== 'boolean') {
    throw new Error('INVALID_ACCESS_WORKSPACE_FLAG');
  }

  return value as AccessSnapshot;
}

/**
 * Free access is server-authoritative.
 *
 * Desktop only applies stricter checks; it never turns a server "false"
 * into permission to use the workspace.
 */
export function canUseFreeWorkspace(access: AccessSnapshot | null): boolean {
  if (!access) return false;

  return (
    access.state === 'FREE_HOUR_ACTIVE' &&
    access.can_use_workspace === true &&
    access.free_remaining_seconds > 0
  );
}

/**
 * Display/helper decision only.
 * claimTrial itself is always re-validated by the server.
 */
export function isTrialClaimAvailable(access: AccessSnapshot | null): boolean {
  if (!access) return false;

  return (
    access.state === 'TRIAL_AVAILABLE' &&
    access.trial_eligible === true &&
    access.trial_used === false
  );
}

export function accessGateStatus(access: AccessSnapshot): AccessGateStatus {
  return access.state;
}
