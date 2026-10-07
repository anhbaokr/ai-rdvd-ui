import type { LicenseRecord, PaymentOrder, PaymentQrResult } from '../paymentContracts';

export type PaymentFlowState = 'WAITING' | 'PROCESSING' | 'SUCCESS' | 'CANCELLED' | 'EXPIRED' | 'ERROR';
export type ActivationStep = 'CREATING_LICENSE' | 'CHECKING_LICENSE' | 'ACTIVATING_DEVICE' | null;

type PaymentModalProps = {
  language: 'vi' | 'en';
  order: PaymentOrder;
  paymentQr: PaymentQrResult | null;
  qrLoading: boolean;
  remainingSeconds: number;
  cancelling: boolean;
  checking: boolean;
  error: string | null;
  flowState: PaymentFlowState;
  activationStep: ActivationStep;
  license: LicenseRecord | null;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
};

function formatRemaining(seconds: number): string {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function PaymentModal({
  language,
  order,
  paymentQr,
  qrLoading,
  remainingSeconds,
  cancelling,
  checking,
  error,
  flowState,
  activationStep,
  license,
  onCancel,
  onClose,
  onRetry,
}: PaymentModalProps) {
  const vi = language === 'vi';
  const transferNote = (vi ? order.payment_note.vi : order.payment_note.en)
    .replace('{payment_code}', order.payment_code);

  const isWaiting = flowState === 'WAITING';
  const isProcessing = flowState === 'PROCESSING';
  const isSuccess = flowState === 'SUCCESS';
  const isTerminal = flowState === 'CANCELLED' || flowState === 'EXPIRED';
  const expiryText = license?.expires_at
    ? new Date(license.expires_at).toLocaleString(vi ? 'vi-VN' : 'en-GB')
    : '';

  const processingText = activationStep === 'CREATING_LICENSE'
    ? (vi ? 'Đang tạo bản quyền...' : 'Creating license...')
    : activationStep === 'CHECKING_LICENSE'
      ? (vi ? 'Đang kiểm tra bản quyền...' : 'Checking license...')
      : (vi ? 'Đang kích hoạt thiết bị...' : 'Activating device...');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rdvd-payment-modal-title"
      className="rdvd-payment-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 2vw, 24px)',
        background: 'rgba(2, 10, 18, 0.78)',
        backdropFilter: 'blur(6px)',
      }}
    >
      <style>{`
        .rdvd-payment-modal {
          width: min(820px, 92vw);
          max-height: calc(100vh - 32px);
          overflow-y: auto;
          border: 1px solid rgba(82, 164, 255, 0.28);
          border-radius: 18px;
          background: linear-gradient(180deg, #0d1c2b 0%, #091521 100%);
          box-shadow: 0 24px 80px rgba(0, 0, 0, 0.48);
          color: #eaf4ff;
          scrollbar-width: thin;
        }

        .rdvd-payment-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 14px clamp(14px, 2vw, 20px);
          border-bottom: 1px solid rgba(148, 187, 220, 0.14);
        }

        .rdvd-payment-modal__body {
          display: grid;
          grid-template-columns: minmax(250px, 1fr) minmax(0, 1fr);
          gap: clamp(14px, 2vw, 20px);
          padding: clamp(14px, 2vw, 20px);
          align-items: start;
        }

        .rdvd-payment-modal__qr-column,
        .rdvd-payment-modal__info-column {
          min-width: 0;
          overflow: hidden;
        }

        .rdvd-payment-modal__qr-box {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 100%;
          max-width: 340px;
          min-height: 0;
          aspect-ratio: 1;
          margin-inline: auto;
          padding: clamp(10px, 1.5vw, 14px);
          box-sizing: border-box;
          border-radius: 14px;
          background: #fff;
          overflow: hidden;
        }

        .rdvd-payment-modal__qr {
          display: block;
          width: clamp(190px, 22vw, 230px);
          max-width: 100%;
          line-height: 0;
          overflow: hidden;
        }

        .rdvd-payment-modal__qr > svg {
          display: block;
          width: 100% !important;
          height: auto !important;
          max-width: 100% !important;
        }

        .rdvd-payment-modal__payment-head {
          display: grid;
          grid-template-columns: 1fr auto;
          align-items: center;
          gap: 10px;
          padding: 12px 14px;
          border-radius: 12px;
          background: rgba(32, 107, 176, 0.12);
          border: 1px solid rgba(83, 166, 244, 0.18);
        }

        .rdvd-payment-modal__meta {
          display: grid;
          gap: 7px;
          margin-top: 12px;
        }

        .rdvd-payment-modal__meta-row {
          display: grid;
          grid-template-columns: minmax(90px, 120px) minmax(0, 1fr);
          gap: 10px;
          align-items: start;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.035);
        }

        .rdvd-payment-modal__meta-label {
          font-size: 11px;
          opacity: 0.58;
        }

        .rdvd-payment-modal__meta-value {
          min-width: 0;
          font-size: 13px;
          overflow-wrap: anywhere;
        }

        .rdvd-payment-modal__note {
          margin-top: 12px;
          padding: 11px 12px;
          border-radius: 12px;
          border: 1px solid rgba(255, 193, 7, 0.22);
          background: rgba(255, 193, 7, 0.06);
        }

        .rdvd-payment-modal__footer {
          display: grid;
          gap: 8px;
          justify-items: center;
          padding: 0 clamp(14px, 2vw, 20px) clamp(14px, 2vw, 18px);
        }

        .rdvd-payment-modal__order-id {
          max-width: 100%;
          text-align: center;
          font-size: 11px;
          opacity: 0.5;
          overflow-wrap: anywhere;
        }

        .rdvd-payment-modal__state {
          display: grid;
          justify-items: center;
          gap: 12px;
          text-align: center;
          padding: clamp(20px, 4vw, 34px);
          min-height: 280px;
          align-content: center;
        }

        .rdvd-payment-modal__state-icon {
          width: 58px;
          height: 58px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: rgba(82, 164, 255, 0.14);
          border: 1px solid rgba(82, 164, 255, 0.26);
          font-size: 28px;
          font-weight: 800;
        }

        .rdvd-payment-modal__state-icon--success {
          background: rgba(64, 200, 128, 0.14);
          border-color: rgba(64, 200, 128, 0.28);
        }

        .rdvd-payment-modal__state-icon--error {
          background: rgba(255, 193, 7, 0.10);
          border-color: rgba(255, 193, 7, 0.24);
        }

        .rdvd-payment-modal__state-title {
          font-size: clamp(18px, 2vw, 24px);
          font-weight: 800;
        }

        .rdvd-payment-modal__state-detail {
          max-width: 520px;
          font-size: 13px;
          line-height: 1.6;
          opacity: 0.76;
        }

        .rdvd-payment-modal__state-summary {
          width: min(100%, 430px);
          display: grid;
          gap: 7px;
          margin-top: 4px;
        }

        .rdvd-payment-modal__state-row {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 10px;
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.035);
          text-align: left;
        }

        .rdvd-payment-modal__state-row span {
          opacity: 0.58;
          font-size: 11px;
        }

        .rdvd-payment-modal__state-row strong {
          font-size: 12px;
          text-align: right;
          overflow-wrap: anywhere;
        }

        @media (max-width: 760px) {
          .rdvd-payment-modal {
            width: min(94vw, 560px);
          }

          .rdvd-payment-modal__body {
            grid-template-columns: 1fr;
          }

          .rdvd-payment-modal__qr-column {
            display: grid;
            justify-items: center;
          }

          .rdvd-payment-modal__qr-box {
            width: min(100%, 320px);
            max-width: 320px;
            min-height: 0;
            aspect-ratio: 1;
          }

          .rdvd-payment-modal__qr {
            width: clamp(180px, 46vw, 220px);
          }
        }

        @media (max-height: 680px) and (min-width: 761px) {
          .rdvd-payment-modal__body {
            gap: 12px;
            padding: 14px;
          }

          .rdvd-payment-modal__qr-box {
            min-height: 240px;
            padding: 8px;
          }

          .rdvd-payment-modal__qr {
            width: clamp(175px, 20vh, 210px);
          }

          .rdvd-payment-modal__meta {
            gap: 5px;
            margin-top: 8px;
          }

          .rdvd-payment-modal__meta-row {
            padding: 6px 9px;
          }

          .rdvd-payment-modal__note {
            margin-top: 8px;
            padding: 9px 10px;
          }

          .rdvd-payment-modal__footer {
            padding-bottom: 12px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rdvd-payment-modal-backdrop {
            backdrop-filter: none;
          }
        }
      `}</style>

      <div className="rdvd-payment-modal">
        <div className="rdvd-payment-modal__header">
          <div>
            <div
              id="rdvd-payment-modal-title"
              style={{ fontSize: 'clamp(16px, 1.4vw, 18px)', fontWeight: 700 }}
            >
              {flowState === 'SUCCESS'
                ? (vi ? 'Thanh toán thành công' : 'Payment successful')
                : flowState === 'PROCESSING'
                  ? (vi ? 'Đang kích hoạt bản quyền' : 'Activating license')
                  : flowState === 'CANCELLED'
                    ? (vi ? 'Đơn thanh toán đã hủy' : 'Payment order cancelled')
                    : flowState === 'EXPIRED'
                      ? (vi ? 'Đơn thanh toán đã hết hạn' : 'Payment order expired')
                      : flowState === 'ERROR'
                        ? (vi ? 'Kích hoạt chưa hoàn tất' : 'Activation incomplete')
                        : (vi ? 'Thanh toán AI RDvD' : 'AI RDvD Payment')}
            </div>
            <div style={{ marginTop: 4, fontSize: 12, opacity: 0.68 }}>
              {flowState === 'WAITING'
                ? (vi ? 'Hoàn tất chuyển khoản để kích hoạt đơn.' : 'Complete the bank transfer to activate the order.')
                : flowState === 'SUCCESS'
                  ? (vi ? 'Bản quyền đã được kích hoạt trên máy này.' : 'The license is active on this device.')
                  : flowState === 'PROCESSING'
                    ? processingText
                    : flowState === 'CANCELLED'
                      ? (vi ? 'Mã QR này không còn sử dụng được.' : 'This QR code can no longer be used.')
                      : flowState === 'EXPIRED'
                        ? (vi ? 'Thời gian thanh toán đã hết. Mã QR không còn sử dụng được.' : 'The payment window expired. This QR code can no longer be used.')
                        : (vi ? 'Thanh toán đã được xác nhận nhưng kích hoạt chưa hoàn tất.' : 'Payment was confirmed but activation is not complete.')}
            </div>
          </div>

          <button
            type="button"
            className="rdvd-secondary"
            onClick={isWaiting ? onCancel : onClose}
            disabled={cancelling || isProcessing}
            aria-label={isWaiting ? (vi ? 'Hủy đơn' : 'Cancel order') : (vi ? 'Đóng' : 'Close')}
            title={isWaiting ? (vi ? 'Hủy đơn' : 'Cancel order') : (vi ? 'Đóng' : 'Close')}
          >
            ×
          </button>
        </div>

        {isWaiting ? (
          <div className="rdvd-payment-modal__body">
            <div className="rdvd-payment-modal__qr-column">
              <div className="rdvd-payment-modal__qr-box">
                {qrLoading ? (
                  <div style={{ color: '#0d1c2b', fontWeight: 600, textAlign: 'center' }}>
                    {vi ? 'Đang tạo mã QR...' : 'Generating payment QR...'}
                  </div>
                ) : paymentQr ? (
                  <div
                    className="rdvd-payment-modal__qr"
                    dangerouslySetInnerHTML={{ __html: paymentQr.qrSvg }}
                  />
                ) : (
                  <div style={{ color: '#7a8793', textAlign: 'center' }}>
                    {vi ? 'Không tạo được mã QR thanh toán.' : 'Could not generate the payment QR.'}
                  </div>
                )}
              </div>
            </div>

            <div className="rdvd-payment-modal__info-column">
              <div className="rdvd-payment-modal__payment-head">
                <div>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>{vi ? 'Số tiền' : 'Amount'}</div>
                  <div style={{ marginTop: 3, fontSize: 'clamp(20px, 2vw, 24px)', fontWeight: 800 }}>
                    {order.amount.toLocaleString('vi-VN')} {order.currency}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, opacity: 0.62 }}>{vi ? 'Còn lại' : 'Remaining'}</div>
                  <div style={{ marginTop: 3, fontSize: 18, fontWeight: 800 }}>
                    {formatRemaining(remainingSeconds)}
                  </div>
                </div>
              </div>

              <div className="rdvd-payment-modal__meta">
                {[
                  [vi ? 'Ngân hàng' : 'Bank', order.payment.bank_name],
                  [vi ? 'Số tài khoản' : 'Account number', order.payment.account_number],
                  [vi ? 'Chủ tài khoản' : 'Account name', order.payment.account_name],
                  [vi ? 'Nội dung chuyển khoản' : 'Transfer note', transferNote],
                ].map(([label, value]) => (
                  <div className="rdvd-payment-modal__meta-row" key={label}>
                    <span className="rdvd-payment-modal__meta-label">{label}</span>
                    <strong className="rdvd-payment-modal__meta-value">{value}</strong>
                  </div>
                ))}
              </div>

              <div className="rdvd-payment-modal__note">
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {vi ? 'Lưu ý thanh toán' : 'Payment notes'}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, lineHeight: 1.5, opacity: 0.82 }}>
                  {vi
                    ? 'Chuyển đúng số tiền và đúng nội dung chuyển khoản. Không sửa nội dung chuyển khoản.'
                    : 'Transfer the exact amount and use the exact transfer note. Do not change the transfer note.'}
                </div>
                <div style={{ marginTop: 5, fontSize: 12, lineHeight: 1.5, opacity: 0.72 }}>
                  {vi ? 'Đơn sẽ tự xử lý khi thanh toán thành công hoặc hết thời gian.' : 'The order will process automatically when payment succeeds or the window expires.'}
                </div>
              </div>

              {error && (
                <div
                  className="rdvd-render-warning rdvd-payment-error"
                  style={{ marginTop: 10 }}
                >
                  ⚠ {error}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rdvd-payment-modal__state">
            <div className={`rdvd-payment-modal__state-icon${isSuccess ? ' rdvd-payment-modal__state-icon--success' : flowState === 'ERROR' ? ' rdvd-payment-modal__state-icon--error' : ''}`}>
              {isSuccess ? '✓' : isTerminal ? '×' : flowState === 'ERROR' ? '!' : '…'}
            </div>

            <div className="rdvd-payment-modal__state-title">
              {isProcessing
                ? processingText
                : isSuccess
                  ? (vi ? '✓ THANH TOÁN THÀNH CÔNG' : '✓ PAYMENT SUCCESSFUL')
                  : flowState === 'CANCELLED'
                    ? (vi ? 'Đơn thanh toán đã được hủy.' : 'The payment order was cancelled.')
                    : flowState === 'EXPIRED'
                      ? (vi ? 'Đơn thanh toán đã hết hạn.' : 'The payment order has expired.')
                      : (vi ? 'Thanh toán đã xác nhận nhưng kích hoạt chưa hoàn tất.' : 'Payment was confirmed but activation is incomplete.') }
            </div>

            <div className="rdvd-payment-modal__state-detail">
              {isProcessing
                ? (vi ? 'Không đóng cửa sổ trong khi hệ thống đang hoàn tất kích hoạt.' : 'Please keep this window open while activation completes.')
                : isSuccess
                  ? (vi ? 'Bản quyền đã được kích hoạt trên máy này.' : 'The license has been activated on this device.')
                  : flowState === 'CANCELLED'
                    ? (vi ? 'Mã QR này không còn sử dụng được. Bạn có thể đóng cửa sổ và tạo đơn mới.' : 'This QR code can no longer be used. Close this window and create a new order.')
                    : flowState === 'EXPIRED'
                      ? (vi ? 'Mã QR này không còn sử dụng được. Bạn có thể đóng cửa sổ và tạo đơn mới.' : 'This QR code can no longer be used. Close this window and create a new order.')
                      : (error || (vi ? 'Bạn có thể thử kích hoạt lại mà không cần tạo đơn mới.' : 'You can retry activation without creating a new payment order.'))}
            </div>

            {isSuccess && (
              <div className="rdvd-payment-modal__state-summary">
                <div className="rdvd-payment-modal__state-row">
                  <span>{vi ? 'Gói' : 'Package'}</span>
                  <strong>{license?.package_name ?? order.package_name}</strong>
                </div>
                <div className="rdvd-payment-modal__state-row">
                  <span>{vi ? 'Thời hạn' : 'Duration'}</span>
                  <strong>{order.duration_days} {vi ? 'ngày' : 'days'}</strong>
                </div>
                <div className="rdvd-payment-modal__state-row">
                  <span>{vi ? 'Hết hạn' : 'Expires'}</span>
                  <strong>{expiryText || order.expires_at}</strong>
                </div>
              </div>
            )}

            {flowState === 'ERROR' && error && (
              <div
                className="rdvd-render-warning rdvd-payment-error"
                style={{ width: 'min(100%, 520px)', marginTop: 2 }}
              >
                ⚠ {error}
              </div>
            )}
          </div>
        )}

        <div className="rdvd-payment-modal__footer">
          {isWaiting ? (
            <button
              type="button"
              className="rdvd-secondary"
              onClick={onCancel}
              disabled={cancelling}
            >
              {cancelling
                ? (vi ? 'Đang hủy...' : 'Cancelling...')
                : (vi ? 'Hủy đơn thanh toán' : 'Cancel payment')}
            </button>
          ) : flowState === 'ERROR' ? (
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
              <button type="button" className="rdvd-action blue-action" onClick={onRetry} disabled={checking}>
                {checking ? (vi ? 'Đang thử lại...' : 'Retrying...') : (vi ? 'Thử kích hoạt lại' : 'Retry activation')}
              </button>
              <button type="button" className="rdvd-secondary" onClick={onClose}>
                {vi ? 'Đóng' : 'Close'}
              </button>
            </div>
          ) : (
            <button type="button" className="rdvd-secondary" onClick={onClose} disabled={isProcessing}>
              {isSuccess ? (vi ? 'Đóng' : 'Close') : (vi ? 'Đóng' : 'Close')}
            </button>
          )}

          <div className="rdvd-payment-modal__order-id">
            {isProcessing
              ? processingText
              : checking
                ? (vi ? 'Đang kiểm tra trạng thái thanh toán...' : 'Checking payment status...')
                : `${vi ? 'Mã đơn' : 'Order ID'}: ${order.order_id}`}
          </div>
        </div>
      </div>
    </div>
  );
}
