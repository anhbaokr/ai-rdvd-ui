/**
 * Hợp đồng dữ liệu phía Desktop cho AI-RDvD Payment Gateway.
 *
 * Desktop không tự quyết định giá, thời hạn, tài khoản nhận tiền hoặc
 * device_limit. Các dữ liệu đó phải đến từ backend.
 */

export const PAYMENT_GATEWAY_URL =
  'https://script.google.com/macros/s/AKfycbyivg56bk-LyvZa3YrRXwlk3R2tI-URE3dlC2L0BmEaZ_ema-QMgW_xzFH7TKZVOQh2/exec';

export type PaymentOrderStatus =
  | 'WAITING'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED'
  | string;

export type PaymentPricingMode = 'FIXED' | 'FLEXIBLE_DAYS' | string;

export interface PaymentCatalogItem {
  package: string;
  name: string;
  amount: number;
  duration_days: number;
  device_limit: number;
  currency: string;
  display_order: number;
  is_trial?: boolean;
  pricing_mode?: PaymentPricingMode;
  base_days?: number | null;
  base_amount?: number | null;
  flex_multiplier?: number | null;
  min_days?: number | null;
  max_days?: number | null;
  min_amount?: number | null;
  amount_round_to?: number | null;
}

export interface PaymentCatalogResponse {
  success: boolean;
  catalog?: {
    packages: PaymentCatalogItem[];
  };
  error?: string;
}

export interface PaymentAccountSnapshot {
  account_id: string;
  bank_name: string;
  bank_bin: string;
  account_number: string;
  account_name: string;
}

export interface PaymentNoteSnapshot {
  vi: string;
  en: string;
}

export interface PaymentOrder {
  order_id: string;
  machine_id: string;
  package: string;
  package_name: string;
  amount: number;
  currency: string;
  duration_days: number;
  device_limit: number;
  payment_code: string;
  status: PaymentOrderStatus;
  created_at: string;
  expires_at: string;
  payment: PaymentAccountSnapshot;
  payment_note: PaymentNoteSnapshot;
  /** Raw token returned once by createOrder and retained in Desktop memory. */
  order_access_token?: string;
  /** Returned by protected checkOrder after backend has created the License. */
  license_token?: string;
}

export interface CreateOrderResponse {
  success: boolean;
  order?: PaymentOrder;
  error?: string;
}

export interface CheckOrderResponse {
  success: boolean;
  order?: PaymentOrder;
  error?: string;
}

export interface MachineIdentity {
  machineId: string;
  scheme: string;
}

export interface PaymentQrResult {
  qrText: string;
  qrSvg: string;
}

export interface LicenseRecord {
  license_id: string;
  order_id: string;
  machine_id: string;
  package: string;
  package_name?: string;
  status: string;
  activated_at: string;
  expires_at: string;
  remaining_days?: number;
  license_token?: string;
  device_limit?: number;
}

export interface CreateLicenseResponse {
  success: boolean;
  duplicate?: boolean;
  license?: LicenseRecord;
  error?: string;
}

export interface CheckLicenseResponse {
  success: boolean;
  license?: LicenseRecord;
  error?: string;
}

export interface LicenseDeviceRecord {
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
  device?: LicenseDeviceRecord;
  license?: LicenseRecord;
  device_count?: number;
  device_limit?: number;
  error?: string;
}
