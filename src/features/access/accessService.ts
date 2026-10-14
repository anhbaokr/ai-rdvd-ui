import { invoke } from '@tauri-apps/api/core';
import { PAYMENT_GATEWAY_URL } from '../payment/paymentContracts';
import type {
  ClaimTrialResponse,
  GetAccessStateResponse,
} from './accessContracts';

async function postAccess<T>(
  action: 'getAccessState' | 'claimTrial',
  data: Record<string, unknown>,
): Promise<T> {
  const response = await invoke<string>('payment_gateway_post', {
    request: {
      url: PAYMENT_GATEWAY_URL,
      body: JSON.stringify({ action, ...data }),
    },
  });

  return JSON.parse(response) as T;
}

function buildAccessRequest(
  machineId: string,
  appVersion?: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    machine_id: machineId,
  };

  if (appVersion) {
    data.app_version = appVersion;
  }

  return data;
}

export async function getAccessState(
  machineId: string,
  appVersion?: string,
): Promise<GetAccessStateResponse> {
  return await postAccess<GetAccessStateResponse>(
    'getAccessState',
    buildAccessRequest(machineId, appVersion),
  );
}

export async function claimTrial(
  machineId: string,
  appVersion?: string,
): Promise<ClaimTrialResponse> {
  return await postAccess<ClaimTrialResponse>(
    'claimTrial',
    buildAccessRequest(machineId, appVersion),
  );
}
