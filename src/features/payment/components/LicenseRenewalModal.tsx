import { useEffect } from 'react';
import type { Language } from '../../../types';
import { PaymentCard } from './PaymentCard';

type LicenseRenewalModalProps = {
  language: Language;
  currentLicense: {
    package: string;
    package_name?: string;
    expires_at: string;
  };
  onClose: () => void;
  onActivated?: () => void | Promise<void>;
};

const steps = [
  {
    vi: 'Chọn gói',
    en: 'Choose a package',
    detailVi: 'Chọn thời hạn/gói muốn kích hoạt hoặc gia hạn.',
    detailEn: 'Choose the package or duration you want to activate or renew.',
  },
  {
    vi: 'Tạo đơn thanh toán',
    en: 'Create payment order',
    detailVi: 'Hệ thống tạo một Order mới trước khi thanh toán.',
    detailEn: 'The system creates a new order before payment.',
  },
  {
    vi: 'Thanh toán bằng QR',
    en: 'Pay by QR',
    detailVi: 'Quét QR và chuyển đúng số tiền, đúng nội dung.',
    detailEn: 'Scan the QR and transfer the exact amount and note.',
  },
  {
    vi: 'Chờ PAID',
    en: 'Wait for PAID',
    detailVi: 'Hệ thống tự kiểm tra trạng thái đơn.',
    detailEn: 'The system automatically checks the order status.',
  },
  {
    vi: 'Nhận bản quyền',
    en: 'Receive license',
    detailVi: 'Sau khi PAID, backend hoàn tất cấp bản quyền nội bộ.',
    detailEn: 'After PAID, the backend completes internal license creation.',
  },
  {
    vi: 'Kích hoạt thiết bị',
    en: 'Activate device',
    detailVi: 'Desktop kiểm tra và kích hoạt bản quyền trên máy này.',
    detailEn: 'Desktop validates and activates the license on this device.',
  },
] as const;

export function LicenseRenewalModal({
  language,
  currentLicense,
  onClose,
  onActivated,
}: LicenseRenewalModalProps) {
  const vi = language === 'vi';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const expiresText = (() => {
    const timestamp = Date.parse(currentLicense.expires_at);
    return Number.isNaN(timestamp)
      ? currentLicense.expires_at
      : new Date(timestamp).toLocaleString(vi ? 'vi-VN' : 'en-GB');
  })();

  const handleActivated = async () => {
    await onActivated?.();
    window.setTimeout(onClose, 2600);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rdvd-license-renewal-title"
      className="rdvd-payment-modal-backdrop"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(12px, 2vw, 24px)',
        background: 'rgba(2, 10, 18, 0.82)',
        backdropFilter: 'blur(7px)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <style>{`
        .rdvd-license-renewal-modal {
          width:min(980px,calc(100vw - 24px));
          max-height:min(760px,calc(100dvh - 24px));
          overflow:hidden auto;
          overscroll-behavior:contain;
          border:1px solid rgba(82,164,255,.30);
          border-radius:18px;
          background:
            radial-gradient(circle at 0% 0%,rgba(57,153,255,.10),transparent 34%),
            radial-gradient(circle at 100% 0%,rgba(136,86,255,.08),transparent 28%),
            linear-gradient(180deg,#0d1d2d 0%,#081420 100%);
          box-shadow:0 26px 80px rgba(0,0,0,.58),inset 0 1px 0 rgba(255,255,255,.035);
          color:#eaf4ff;
          scrollbar-width:thin;
          scrollbar-color:#294b68 transparent;
        }
        .rdvd-license-renewal-modal::-webkit-scrollbar{width:7px}
        .rdvd-license-renewal-modal::-webkit-scrollbar-track{background:transparent}
        .rdvd-license-renewal-modal::-webkit-scrollbar-thumb{background:#294b68;border-radius:99px}
        .rdvd-license-renewal-head {
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          align-items:center;
          gap:14px;
          padding:15px 17px;
          border-bottom:1px solid rgba(148,187,220,.13);
          background:linear-gradient(180deg,rgba(17,37,56,.76),rgba(11,27,42,.42));
          position:sticky;
          top:0;
          z-index:3;
          backdrop-filter:blur(12px);
        }
        .rdvd-license-renewal-kicker {
          display:inline-flex;
          align-items:center;
          gap:7px;
          font-size:9px;
          letter-spacing:.13em;
          text-transform:uppercase;
          color:#75b9ee;
          opacity:.88;
        }
        .rdvd-license-renewal-kicker::before {
          content:'$';
          width:22px;
          height:22px;
          display:grid;
          place-items:center;
          border-radius:8px;
          background:linear-gradient(180deg,#163d5d,#102b42);
          border:1px solid rgba(81,171,255,.34);
          color:#bfe4ff;
          font-size:12px;
          font-weight:800;
          box-shadow:0 0 20px rgba(58,164,255,.12);
        }
        .rdvd-license-renewal-title {
          margin-top:6px;
          font-size:clamp(18px,2vw,24px);
          line-height:1.1;
          font-weight:850;
          letter-spacing:.01em;
        }
        .rdvd-license-renewal-subtitle {
          margin-top:5px;
          font-size:11px;
          line-height:1.45;
          color:#8ea7bb;
        }
        .rdvd-license-renewal-close {
          width:34px;
          height:34px;
          border-radius:10px;
          border:1px solid rgba(89,159,207,.28);
          background:rgba(22,48,70,.72);
          color:#9fb7c9;
          transition:transform .16s ease,border-color .16s ease,background .16s ease,color .16s ease;
        }
        .rdvd-license-renewal-close:hover {
          transform:translateY(-1px);
          border-color:rgba(85,175,255,.46);
          background:rgba(24,60,88,.88);
          color:#eaf6ff;
        }
        .rdvd-license-renewal-body {
          display:grid;
          grid-template-columns:minmax(0,.92fr) minmax(0,1.08fr);
          gap:14px;
          padding:14px;
          align-items:stretch;
        }
        .rdvd-license-renewal-panel {
          min-width:0;
          padding:13px;
          border:1px solid rgba(91,153,199,.14);
          border-radius:14px;
          background:linear-gradient(180deg,rgba(17,38,56,.50),rgba(10,25,39,.34));
          box-shadow:inset 0 1px 0 rgba(255,255,255,.018);
        }
        .rdvd-license-renewal-payment > .rdvd-payment-card {
          margin:0;
          padding:0;
          border:0;
          background:transparent;
          box-shadow:none;
        }
        .rdvd-license-renewal-payment > .rdvd-payment-card .rdvd-step { margin-bottom:8px; }
        .rdvd-license-renewal-payment > .rdvd-payment-card .rdvd-step > span { opacity:.42; }
        .rdvd-license-renewal-current {
          display:grid;
          grid-template-columns:minmax(0,1fr) auto;
          gap:7px 10px;
          padding:10px;
          border-radius:12px;
          border:1px solid rgba(62,221,145,.18);
          background:rgba(33,141,96,.08);
        }
        .rdvd-license-renewal-current span {
          font-size:10px;
          opacity:.58;
        }
        .rdvd-license-renewal-current strong {
          font-size:12px;
          text-align:right;
          overflow-wrap:anywhere;
        }
        .rdvd-license-renewal-steps {
          display:grid;
          grid-template-columns:repeat(2,minmax(0,1fr));
          gap:8px;
          margin-top:12px;
        }
        .rdvd-license-renewal-step {
          display:grid;
          grid-template-columns:28px minmax(0,1fr);
          gap:8px;
          align-items:start;
          min-width:0;
          padding:9px;
          border-radius:11px;
          border:1px solid rgba(91,153,199,.13);
          background:rgba(10,27,42,.42);
          transition:border-color .16s ease,background .16s ease,transform .16s ease;
        }
        .rdvd-license-renewal-step:hover { border-color:rgba(82,164,255,.26); background:rgba(14,36,55,.60); transform:translateY(-1px); }
        .rdvd-license-renewal-number {
          width:28px;
          height:28px;
          display:grid;
          place-items:center;
          border-radius:9px;
          font-size:12px;
          font-weight:800;
          background:linear-gradient(180deg,rgba(82,164,255,.16),rgba(47,108,165,.10));
          border:1px solid rgba(82,164,255,.25);
          color:#bfe1ff;
          box-shadow:inset 0 1px 0 rgba(255,255,255,.04);
        }
        .rdvd-license-renewal-step-title {
          font-size:12px;
          font-weight:800;
        }
        .rdvd-license-renewal-step-detail {
          margin-top:3px;
          font-size:10px;
          line-height:1.5;
          opacity:.62;
        }
        .rdvd-license-renewal-payment {
          min-width:0;
        }
        .rdvd-license-renewal-payment select {
          color-scheme: dark;
          background: linear-gradient(180deg, #10273a 0%, #0b1b2a 100%) !important;
          color: #eaf4ff !important;
          border: 1px solid rgba(72, 170, 255, 0.28) !important;
          box-shadow: inset 0 1px 0 rgba(255,255,255,.025), 0 0 0 1px rgba(72,170,255,.025);
        }
        .rdvd-license-renewal-payment select:hover {
          border-color: rgba(72, 170, 255, 0.42) !important;
        }
        .rdvd-license-renewal-payment select:focus-visible {
          outline: none;
          border-color: rgba(72, 170, 255, 0.70) !important;
          box-shadow: 0 0 0 3px rgba(72, 170, 255, 0.12), 0 10px 28px rgba(0,0,0,.16);
        }
        .rdvd-license-renewal-payment select option,
        .rdvd-license-renewal-payment select optgroup {
          background:#0b1b2a !important;
          color:#eaf4ff !important;
        }
        .rdvd-license-renewal-payment .rdvd-payment-package-summary { margin-top:6px; }
        .rdvd-license-renewal-payment .rdvd-payment-order-summary { margin-top:6px; }
        .rdvd-license-renewal-payment .blue-action {
          min-height:36px; border-radius:10px;
          background:linear-gradient(180deg,#2e8de6 0%,#1e67bb 100%);
          border:1px solid rgba(107,190,255,.34);
          box-shadow:0 8px 18px rgba(14,92,165,.24),inset 0 1px 0 rgba(255,255,255,.12);
        }
        .rdvd-license-renewal-payment .blue-action:hover:not(:disabled) { filter:brightness(1.06); transform:translateY(-1px); }
        @media (max-width:920px) {
          .rdvd-license-renewal-body { grid-template-columns:1fr; }
          .rdvd-license-renewal-steps { grid-template-columns:repeat(3,minmax(0,1fr)); }
        }
        @media (max-width:700px) {
          .rdvd-license-renewal-modal { width:calc(100vw - 14px); max-height:calc(100dvh - 14px); border-radius:15px; }
          .rdvd-license-renewal-head { padding:12px 13px; }
          .rdvd-license-renewal-body { padding:9px; gap:9px; }
          .rdvd-license-renewal-panel { padding:11px; border-radius:12px; }
          .rdvd-license-renewal-steps { grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; }
          .rdvd-license-renewal-step-detail { font-size:9px; }
        }
        @media (max-width:480px) {
          .rdvd-license-renewal-title { font-size:18px; }
          .rdvd-license-renewal-subtitle { font-size:10px; }
          .rdvd-license-renewal-steps { grid-template-columns:1fr; }
        }
        @media (max-height:760px) and (min-width:921px) {
          .rdvd-license-renewal-head { padding:11px 15px; }
          .rdvd-license-renewal-body { padding:9px; gap:9px; }
          .rdvd-license-renewal-panel { padding:10px; }
          .rdvd-license-renewal-steps { gap:6px; margin-top:9px; }
          .rdvd-license-renewal-step { padding:7px; }
          .rdvd-license-renewal-step-detail { font-size:9px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .rdvd-license-renewal-modal {
            scroll-behavior:auto;
          }
        }
      `}</style>

      <div className="rdvd-license-renewal-modal">
        <div className="rdvd-license-renewal-head">
          <div>
            <div className="rdvd-license-renewal-kicker">
              AI RDvD · {vi ? 'Payment Gateway' : 'Payment Gateway'}
            </div>
            <div id="rdvd-license-renewal-title" className="rdvd-license-renewal-title">
              {vi ? 'KÍCH HOẠT / GIA HẠN BẢN QUYỀN' : 'ACTIVATE / RENEW LICENSE'}
            </div>
            <div className="rdvd-license-renewal-subtitle">
              {vi
                ? 'Tạo một đơn thanh toán mới mà không làm gián đoạn bản quyền đang hoạt động.'
                : 'Create a new payment order without interrupting the license that is currently active.'}
            </div>
          </div>

          <button
            type="button"
            className="rdvd-secondary rdvd-license-renewal-close"
            onClick={onClose}
            aria-label={vi ? 'Đóng' : 'Close'}
            title={vi ? 'Đóng' : 'Close'}
          >
            ×
          </button>
        </div>

        <div className="rdvd-license-renewal-body">
          <div className="rdvd-license-renewal-panel">
            <div style={{ fontSize: 13, fontWeight: 800 }}>
              {vi ? 'Quy trình thanh toán' : 'Payment flow'}
            </div>
            <div style={{ marginTop: 4, fontSize: 10, opacity: .58, lineHeight: 1.5 }}>
              {vi
                ? 'Mọi bước kỹ thuật được xử lý tự động ở phía hệ thống.'
                : 'All technical steps are handled automatically by the system.'}
            </div>

            <div className="rdvd-license-renewal-current" style={{ marginTop: 12 }}>
              <span>{vi ? 'Gói hiện tại' : 'Current package'}</span>
              <strong>{currentLicense.package_name || currentLicense.package}</strong>
              <span>{vi ? 'Hết hạn' : 'Expires'}</span>
              <strong>{expiresText}</strong>
            </div>

            <div className="rdvd-license-renewal-steps">
              {steps.map((step, index) => (
                <div className="rdvd-license-renewal-step" key={step.en}>
                  <div className="rdvd-license-renewal-number">{index + 1}</div>
                  <div>
                    <div className="rdvd-license-renewal-step-title">{vi ? step.vi : step.en}</div>
                    <div className="rdvd-license-renewal-step-detail">{vi ? step.detailVi : step.detailEn}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rdvd-license-renewal-panel rdvd-license-renewal-payment">
            <PaymentCard
              language={language}
              onActivated={() => { void handleActivated(); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
