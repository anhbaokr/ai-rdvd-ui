import { generatePaymentQr } from './paymentService';
import type { PaymentOrder, PaymentQrResult } from './paymentContracts';

/** Tạo QR VietQR từ snapshot của Order; không lấy dữ liệu tài khoản từ UI. */
export async function buildOrderPaymentQr(
  order: PaymentOrder,
  transferNote: string,
): Promise<PaymentQrResult> {
  return await generatePaymentQr(order, transferNote);
}
