/**
 * Contract dữ liệu phía Desktop cho License API của AI-RDvD Payment Gateway.
 *
 * Desktop chỉ làm client của backend. Không tự quyết định trạng thái License.
 */

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
}

export interface CreateLicenseResponse {
  success: boolean;
  duplicate?: boolean;
  message?: string;
  license?: LicenseRecord;
  error?: string;
}

export interface CheckLicenseResponse {
  success: boolean;
  license?: Omit<LicenseRecord, 'license_token'>;
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
  device_count?: number;
  device_limit?: number;
  error?: string;
}
