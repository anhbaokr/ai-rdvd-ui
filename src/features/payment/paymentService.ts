import { invoke } from '@tauri-apps/api/core';
import {
  PAYMENT_GATEWAY_URL,
  type CheckOrderResponse,
  type CreateOrderResponse,
  type MachineIdentity,
  type PaymentCatalogResponse,
  type PaymentOrder,
  type PaymentQrResult,
  type ActivateDeviceResponse,
  type CheckLicenseResponse,
  type CreateLicenseResponse,
} from './paymentContracts';

export type CancelPaymentOrderResponse = {
  success: boolean;
  cancelled?: boolean;
  order_id?: string;
  status?: string;
  error?: string;
};

async function post<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const response = await invoke<string>('payment_gateway_post', {
    request: {
      url: PAYMENT_GATEWAY_URL,
      body: JSON.stringify({ action, ...data }),
    },
  });

  return JSON.parse(response) as T;
}

export async function getMachineIdentity(): Promise<MachineIdentity> {
  return await invoke<MachineIdentity>('get_machine_id');
}

export async function getPaymentCatalog(): Promise<PaymentCatalogResponse> {
  return await post<PaymentCatalogResponse>('getPaymentCatalog');
}

export async function createPaymentOrder(
  machineId: string,
  packageCode: string,
  durationDays?: number,
): Promise<CreateOrderResponse> {
  const data: Record<string, unknown> = {
    machine_id: machineId,
    package: packageCode,
  };

  if (durationDays !== undefined) {
    data.duration_days = durationDays;
  }

  return await post<CreateOrderResponse>('createOrder', data);
}

export async function checkPaymentOrder(orderId: string): Promise<CheckOrderResponse> {
  return await post<CheckOrderResponse>('checkOrder', {
    order_id: orderId,
  });
}

export async function createLicense(orderId: string): Promise<CreateLicenseResponse> {
  return await post<CreateLicenseResponse>('createLicense', {
    order_id: orderId,
  });
}

export async function checkLicense(licenseToken: string, machineId: string): Promise<CheckLicenseResponse> {
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

export async function cancelPaymentOrder(
  orderId: string,
  machineId: string,
): Promise<CancelPaymentOrderResponse> {
  return await post<CancelPaymentOrderResponse>('cancelOrder', {
    order_id: orderId,
    machine_id: machineId,
  });
}

export async function generatePaymentQr(
  order: PaymentOrder,
  transferNote: string,
): Promise<PaymentQrResult> {
  return await invoke<PaymentQrResult>('generate_payment_qr', {
    request: {
      bankBin: order.payment.bank_bin,
      accountNumber: order.payment.account_number,
      accountName: order.payment.account_name,
      amount: Math.round(order.amount),
      paymentCode: order.payment_code,
      transferNote,
    },
  });
}
