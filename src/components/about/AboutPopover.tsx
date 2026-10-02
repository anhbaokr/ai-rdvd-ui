import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import type { Language } from '../../types';
import './about.css';

type DonationInfo = {
  status: 'verified' | 'unconfigured' | 'invalid';
  verified: boolean;
  author: string;
  bankName: string;
  accountNumber: string;
  accountName: string;
  qrSvg: string | null;
  message: string;
};

interface AboutPopoverProps {
  language: Language;
}

export function AboutPopover({ language }: AboutPopoverProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [donation, setDonation] = React.useState<DonationInfo | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);

  const vi = language === 'vi';

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 180);
  };

  const openAbout = () => {
    clearCloseTimer();
    setOpen(true);
  };

  const toggleAbout = () => {
    clearCloseTimer();
    setOpen((current) => !current);
  };

  React.useEffect(() => {
    return () => clearCloseTimer();
  }, []);

  React.useEffect(() => {
    if (!open || donation) return;
    let cancelled = false;
    setLoading(true);
    invoke<DonationInfo>('get_donation_info')
      .then((result) => {
        if (!cancelled) setDonation(result);
      })
      .catch((error) => {
        if (!cancelled) {
          setDonation({
            status: 'invalid',
            verified: false,
            author: '',
            bankName: '',
            accountNumber: '',
            accountName: '',
            qrSvg: null,
            message: String(error),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [donation, open]);

  React.useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && rootRef.current?.contains(target)) return;
      clearCloseTimer();
      setOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearCloseTimer();
        setOpen(false);
      }
    };

    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const copyAccount = async () => {
    if (!donation?.accountNumber) return;
    try {
      await navigator.clipboard.writeText(donation.accountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  };

  const qrDataUrl = donation?.qrSvg
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(donation.qrSvg)}`
    : null;

  return (
    <div
      ref={rootRef}
      className="rdvd-about-anchor"
      onMouseEnter={openAbout}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        className="rdvd-icon-btn rdvd-about-button"
        aria-label={vi ? 'Giới thiệu' : 'About'}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggleAbout}
        title={vi ? 'Giới thiệu & Ủng hộ tác giả' : 'About & Support the author'}
      >
        <span aria-hidden="true">ⓘ</span>
      </button>

      {open && (
        <section
          className="rdvd-about-popover"
          role="dialog"
          aria-label={vi ? 'Giới thiệu AI RDvD' : 'About AI RDvD'}
          onMouseEnter={openAbout}
          onMouseLeave={scheduleClose}
        >
          <header className="rdvd-about-head">
            <div>
              <span className="rdvd-about-eyebrow">AI RDvD</span>
              <strong>{vi ? 'Giới thiệu' : 'About'}</strong>
            </div>
            <span className="rdvd-about-version">v0.1.0</span>
          </header>

          <div className="rdvd-about-body">
            <p className="rdvd-about-description">
              {vi
                ? 'Nhận dạng, dịch và lồng tiếng video bằng AI.'
                : 'AI-powered video recognition, translation and dubbing.'}
            </p>

            <div className="rdvd-about-author">
              <span className="rdvd-about-label">{vi ? 'Tác giả' : 'Author'}</span>
              <strong>{donation?.author || (vi ? 'Đang cấu hình' : 'Configuration pending')}</strong>
            </div>

            <div className="rdvd-about-support">
              <div className="rdvd-about-support-title">
                <span aria-hidden="true">♥</span>
                <strong>{vi ? 'Ủng hộ tác giả' : 'Support the author'}</strong>
              </div>

              {loading && (
                <div className="rdvd-about-status">{vi ? 'Đang xác thực…' : 'Verifying…'}</div>
              )}

              {!loading && donation?.status === 'verified' && qrDataUrl && (
                <>
                  <p className="rdvd-about-hint">
                    {vi
                      ? 'Nếu bạn thấy AI RDvD hữu ích, bạn có thể quét mã QR để ủng hộ.'
                      : 'If AI RDvD is useful to you, you can scan this QR to support the author.'}
                  </p>

                  <div className="rdvd-about-qr-wrap">
                    <img className="rdvd-about-qr" src={qrDataUrl} alt={vi ? 'Mã QR ủng hộ tác giả' : 'Support QR code'} />
                  </div>

                  <div className="rdvd-about-payment">
                    <div>
                      <span>{vi ? 'Ngân hàng' : 'Bank'}</span>
                      <strong>{donation.bankName}</strong>
                    </div>
                    <div>
                      <span>{vi ? 'Số tài khoản' : 'Account number'}</span>
                      <strong>{donation.accountNumber}</strong>
                    </div>
                    <div>
                      <span>{vi ? 'Chủ tài khoản' : 'Account name'}</span>
                      <strong>{donation.accountName}</strong>
                    </div>
                    <button type="button" className="rdvd-about-copy" onClick={() => void copyAccount()}>
                      {copied ? (vi ? 'Đã sao chép ✓' : 'Copied ✓') : (vi ? 'Sao chép STK' : 'Copy account')}
                    </button>
                  </div>
                </>
              )}

              {!loading && donation?.status === 'unconfigured' && (
                <div className="rdvd-about-status rdvd-about-status-muted">
                  {vi
                    ? 'Thông tin ủng hộ chính thức đang chờ cấu hình.'
                    : 'Official support information is waiting to be configured.'}
                </div>
              )}

              {!loading && donation?.status === 'invalid' && (
                <div className="rdvd-about-status rdvd-about-status-error">
                  {vi
                    ? '⚠ Thông tin ủng hộ không hợp lệ hoặc đã bị thay đổi.'
                    : '⚠ Support information is invalid or has been modified.'}
                </div>
              )}
            </div>

            <div className="rdvd-about-integrity">
              <span className={`rdvd-about-integrity-dot ${donation?.verified ? 'ok' : ''}`} />
              <span>
                {donation?.verified
                  ? (vi ? 'Dữ liệu ủng hộ đã được xác thực.' : 'Support data verified.')
                  : (vi ? 'Xác thực chữ ký chưa sẵn sàng.' : 'Signature verification is not configured yet.')}
              </span>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
