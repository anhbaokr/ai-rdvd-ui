/**
 * Contract dữ liệu phía Desktop cho License API của AI-RDvD Payment Gateway.
 *
 * Desktop chỉ làm client của backend. Không tự quyết định trạng thái License.
 */

export interface OfflineEntitlementEnvelope {
  version: number;
  alg: string;
  key_id: string;
  payload: string;
  signature: string;
}

export interface OfflineEntitlementVerification {
  valid: boolean;
  keyId: string;
  licenseId: string;
  orderId: string;
  package: string;
  issuedAtMs: number;
  offlineGraceExpiresAtMs: number;
  licenseExpiresAt: string;
  licenseExpiresAtMs?: number | null;
}

export interface LicenseRecord {
  license_id: string;
  order_id: string;
  machine_id: string;
  package: string;
  status: string;
  activated_at: string;
  expires_at: string;
  remaining_days?: number;
  package_name?: string;
  device_limit?: number;
  license_token?: string;
  offline_entitlement?: OfflineEntitlementEnvelope;
}

export interface CreateLicenseResponse {
  success: boolean;
  duplicate?: boolean;
  message?: string;
  license?: LicenseRecord;
  offline_entitlement?: OfflineEntitlementEnvelope;
  error?: string;
}

export interface CheckLicenseResponse {
  success: boolean;
  license?: Omit<LicenseRecord, 'license_token'>;
  offline_entitlement?: OfflineEntitlementEnvelope;
  error?: string;
}

export interface ActivateDeviceRecord {
  device_id: string;
  machine_id: string;
  first_seen: string;
  last_seen: string;
  status: string;
}

export interface ActivateDeviceResponse {
  success: boolean;
  duplicate?: boolean;
  message?: string;
  device?: ActivateDeviceRecord;
  license?: Omit<LicenseRecord, 'license_token'>;
  offline_entitlement?: OfflineEntitlementEnvelope;
  device_count?: number;
  device_limit?: number;
  error?: string;
}
