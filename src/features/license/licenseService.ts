import { invoke } from '@tauri-apps/api/core';
import type { MachineIdentity } from '../payment/paymentContracts';
import { PAYMENT_GATEWAY_URL } from '../payment/paymentContracts';
import type {
  ActivateDeviceResponse,
  CheckLicenseResponse,
  LicenseRecord,
} from './licenseContracts';

async function post<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const response = await invoke<string>('payment_gateway_post', {
    request: {
      url: PAYMENT_GATEWAY_URL,
      body: JSON.stringify({ action, ...data }),
    },
  });

  return JSON.parse(response) as T;
}

export async function checkLicense(
  licenseToken: string,
  machineId: string,
): Promise<CheckLicenseResponse> {
  return await post<CheckLicenseResponse>('checkLicense', {
    license_token: licenseToken,
    machine_id: machineId,
  });
}

export async function activateDevice(
  licenseToken: string,
  machineId: string,
  deviceId: string,
): Promise<ActivateDeviceResponse> {
  return await post<ActivateDeviceResponse>('activateDevice', {
    license_token: licenseToken,
    machine_id: machineId,
    device_id: deviceId,
  });
}

export interface LocalLicenseState {
  schemaVersion: number;
  licenseToken: string;
  machineId?: string;
  lastVerifiedAtMs?: number;
  offlineGraceUntilMs?: number;
  license?: Omit<LicenseRecord, 'license_token'>;
}

export async function getMachineIdentity(): Promise<MachineIdentity> {
  return await invoke<MachineIdentity>('get_machine_id');
}

export async function getLocalLicenseState(): Promise<LocalLicenseState | null> {
  return await invoke<LocalLicenseState | null>('get_local_license_state');
}

export async function saveLicenseState(state: {
  licenseToken: string;
  machineId: string;
  lastVerifiedAtMs: number;
  offlineGraceUntilMs: number;
  license: Omit<LicenseRecord, 'license_token'>;
}): Promise<void> {
  await invoke('save_license_state', state);
}

export async function saveLicenseToken(licenseToken: string): Promise<void> {
  await invoke('save_license_token', { licenseToken });
}

export async function clearLicenseToken(): Promise<void> {
  await invoke('clear_license_token');
}
