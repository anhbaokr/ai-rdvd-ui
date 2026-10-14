/**
 * Server-authoritative access contract for AI-RDvD Desktop.
 *
 * Desktop must not derive first_seen_at, free_expires_at, Trial eligibility,
 * Trial expiry, or device_limit on its own. Those values come from backend.
 */

export type AccessState =
  | 'ACCESS_BLOCKED'
  | 'FREE_HOUR_ACTIVE'
  | 'TRIAL_AVAILABLE'
  | 'LICENSE_REQUIRED';

export interface AccessTrialPackage {
  package: string;
  name: string;
  duration_days: number;
  device_limit: number;
}

export interface AccessSnapshot {
  state: AccessState;
  machine_id: string;
  server_time: string;
  first_seen_at: string;
  free_expires_at: string;
  free_remaining_seconds: number;
  trial_used: boolean;
  trial_eligible: boolean;
  trial_package: AccessTrialPackage | null;
  can_use_workspace: boolean;
  reason?: string;
}

export interface GetAccessStateResponse {
  success: boolean;
  access?: AccessSnapshot;
  error?: string;
}

export interface AccessTrialLicense {
  license_id: string;
  order_id: string;
  machine_id: string;
  package: string;
  package_name?: string;
  status: string;
  activated_at: string;
  expires_at: string;
  license_token: string;
  device_limit: number;
  is_trial: boolean;
  trial_claimed: boolean;
}

export interface ClaimTrialResponse {
  success: boolean;
  duplicate?: boolean;
  message?: string;
  license?: AccessTrialLicense;
  error?: string;
  machine_id?: string;
  server_time?: string;
  free_expires_at?: string;
  free_remaining_seconds?: number;
  duration_days?: number;
}
