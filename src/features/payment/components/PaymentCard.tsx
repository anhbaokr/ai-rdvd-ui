import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  checkPaymentOrder,
  generatePaymentQr,
  getMachineIdentity,
  getPaymentCatalog,
  type MachineIdentity,
  type PaymentCatalogItem,
  type PaymentOrder,
  type PaymentQrResult,
} from '../index';
import {
  cancelPaymentOrder,
  createPaymentOrder,
} from '../paymentService';
import {
  activateDevice,
  checkLicense,
  createLicense,
  saveLicenseToken,
} from '../../license/licenseService';
import type { LicenseRecord } from '../paymentContracts';
import {
  PaymentModal,
  type ActivationStep,
  type PaymentFlowState,
} from './PaymentModal';

type PaymentCardProps = {
  language: 'vi' | 'en';
  onActivated?: () => void | Promise<void>;
};

export function PaymentCard({ language, onActivated }: PaymentCardProps) {
  const vi = language === 'vi';
  const [catalog, setCatalog] = useState<PaymentCatalogItem[]>([]);
  const [machine, setMachine] = useState<MachineIdentity | null>(null);
  const [selectedPackage, setSelectedPackage] = useState('');
  const [customDays, setCustomDays] = useState('30');
  const [order, setOrder] = useState<PaymentOrder | null>(null);
  const [paymentQr, setPaymentQr] = useState<PaymentQrResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [qrLoading, setQrLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flowState, setFlowState] = useState<PaymentFlowState>('WAITING');
  const [activationStep, setActivationStep] = useState<ActivationStep>(null);
  const [activeLicense, setActiveLicense] = useState<LicenseRecord | null>(null);
  const activationStartedRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [identity, response] = await Promise.all([
        getMachineIdentity(),
        getPaymentCatalog(),
      ]);
      if (!response.success) {
        throw new Error(response.error || (vi ? 'Không tải được danh mục gói.' : 'Could not load package catalog.'));
      }
      const packages = response.catalog?.packages ?? [];
      setMachine(identity);
      setCatalog(packages);
      setSelectedPackage((current) => packages.some((item) => item.package === current) ? current : packages[0]?.package ?? '');
      setOrder(null);
      setPaymentQr(null);
      setPaymentModalOpen(false);
      setRemainingSeconds(0);
      setFlowState('WAITING');
      setActivationStep(null);
      activationStartedRef.current = false;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [vi]);

  useEffect(() => { void load(); }, [load]);

  const selected = useMemo(
    () => catalog.find((item) => item.package === selectedPackage) ?? null,
    [catalog, selectedPackage],
  );

  const customDaysBounds = useMemo(() => {
    if (selected?.pricing_mode !== 'FLEXIBLE_DAYS') return null;
    return {
      min: Number.isInteger(selected.min_days) ? Number(selected.min_days) : 1,
      max: Number.isInteger(selected.max_days) ? Number(selected.max_days) : 3650,
    };
  }, [selected]);

  const parsedCustomDays = Number(customDays);
  const customDaysValid = customDaysBounds
    ? Number.isInteger(parsedCustomDays)
      && parsedCustomDays >= customDaysBounds.min
      && parsedCustomDays <= customDaysBounds.max
    : true;

  useEffect(() => {
    if (!customDaysBounds) return;
    setCustomDays((current) => {
      const currentValue = Number(current);
      if (Number.isInteger(currentValue) && currentValue >= customDaysBounds.min && currentValue <= customDaysBounds.max) {
        return current;
      }
      const preferred = Math.min(Math.max(30, customDaysBounds.min), customDaysBounds.max);
      return String(preferred);
    });
  }, [customDaysBounds]);

  const closePaymentModal = useCallback(() => {
    setPaymentModalOpen(false);
    setPaymentQr(null);
    setOrder(null);
    setRemainingSeconds(0);
    setChecking(false);
    setCancelling(false);
    setFlowState('WAITING');
    setActivationStep(null);
    activationStartedRef.current = false;
    setError(null);
  }, []);

  const runActivation = useCallback(async (paidOrder: PaymentOrder) => {
    if (activationStartedRef.current) return;

    activationStartedRef.current = true;
    setError(null);
    setFlowState('PROCESSING');
    setActivationStep('CREATING_LICENSE');

    try {
      const licenseResponse = await createLicense(paidOrder.order_id);
      if (!licenseResponse.success || !licenseResponse.license?.license_token) {
        throw new Error(
          licenseResponse.error
          || (vi ? 'Thanh toán đã được xác nhận nhưng chưa tạo được bản quyền.' : 'Payment was confirmed but the license could not be created.'),
        );
      }

      const licenseToken = licenseResponse.license.license_token;
      setActiveLicense(licenseResponse.license);

      setActivationStep('CHECKING_LICENSE');
      const checkResponse = await checkLicense(licenseToken, paidOrder.machine_id);
      if (!checkResponse.success || !checkResponse.license || checkResponse.license.status !== 'ACTIVE') {
        throw new Error(
          checkResponse.error
          || (vi ? 'Bản quyền chưa ở trạng thái ACTIVE.' : 'The license is not ACTIVE.'),
        );
      }

      setActiveLicense({ ...checkResponse.license, license_token: licenseToken });

      setActivationStep('ACTIVATING_DEVICE');
      const activateResponse = await activateDevice(
        licenseToken,
        paidOrder.machine_id,
        paidOrder.machine_id,
      );
      if (!activateResponse.success) {
        throw new Error(
          activateResponse.error
          || (vi ? 'Không kích hoạt được thiết bị.' : 'Could not activate this device.'),
        );
      }

      if (activateResponse.license) {
        setActiveLicense({ ...activateResponse.license, license_token: licenseToken });
      }

      await saveLicenseToken(licenseToken);
      setActivationStep(null);
      setFlowState('SUCCESS');
      await onActivated?.();
    } catch (cause) {
      setActivationStep(null);
      setFlowState('ERROR');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [onActivated, vi]);

  const refreshOrderStatus = useCallback(async () => {
    if (!order || checking || flowState !== 'WAITING') return;
    setChecking(true);
    try {
      const response = await checkPaymentOrder(order.order_id);
      if (!response.success || !response.order) {
        throw new Error(response.error || (vi ? 'Không kiểm tra được trạng thái đơn.' : 'Could not check order status.'));
      }

      const latestOrder = response.order;
      setOrder(latestOrder);

      if (latestOrder.status === 'PAID') {
        await runActivation(latestOrder);
      } else if (latestOrder.status === 'CANCELLED') {
        setFlowState('CANCELLED');
      } else if (latestOrder.status === 'EXPIRED') {
        setFlowState('EXPIRED');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setChecking(false);
    }
  }, [checking, flowState, order, runActivation, vi]);

  const handleCancelOrder = useCallback(async () => {
    if (!order || !machine?.machineId || cancelling || flowState !== 'WAITING') return;
    setCancelling(true);
    setError(null);
    try {
      const response = await cancelPaymentOrder(order.order_id, machine.machineId);
      if (!response.success) {
        throw new Error(response.error || (vi ? 'Không hủy được đơn thanh toán.' : 'Could not cancel the payment order.'));
      }
      setOrder((current) => current ? { ...current, status: response.status || 'CANCELLED' } : current);
      setFlowState('CANCELLED');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCancelling(false);
    }
  }, [cancelling, flowState, machine?.machineId, order, vi]);

  const handleRetryActivation = useCallback(() => {
    if (!order || order.status !== 'PAID' || checking || flowState !== 'ERROR') return;
    activationStartedRef.current = false;
    setChecking(true);
    void runActivation(order).finally(() => {
      setChecking(false);
    });
  }, [checking, flowState, order, runActivation]);

  const handleCreateOrder = useCallback(async () => {
    if (!machine?.machineId || !selectedPackage || creating || order) return;
    setCreating(true);
    setQrLoading(false);
    setPaymentQr(null);
    setError(null);
    setFlowState('WAITING');
    setActivationStep(null);
    activationStartedRef.current = false;
    try {
      const durationDays = selected?.pricing_mode === 'FLEXIBLE_DAYS' ? parsedCustomDays : undefined;
      if (selected?.pricing_mode === 'FLEXIBLE_DAYS' && !customDaysValid) {
        throw new Error(
          vi
            ? `Số ngày phải là số nguyên từ ${customDaysBounds?.min ?? 1} đến ${customDaysBounds?.max ?? 3650}.`
            : `Days must be an integer from ${customDaysBounds?.min ?? 1} to ${customDaysBounds?.max ?? 3650}.`,
        );
      }

      const response = await createPaymentOrder(machine.machineId, selectedPackage, durationDays);
      if (!response.success || !response.order) {
        throw new Error(response.error || (vi ? 'Không tạo được đơn thanh toán.' : 'Could not create payment order.'));
      }

      const createdOrder = response.order;
      setOrder(createdOrder);
      setPaymentModalOpen(true);
      setRemainingSeconds(Math.max(0, Math.ceil((Date.parse(createdOrder.expires_at) - Date.now()) / 1000)));

      setQrLoading(true);
      try {
        const transferNote = (vi ? createdOrder.payment_note.vi : createdOrder.payment_note.en)
          .replace('{payment_code}', createdOrder.payment_code);
        const qr = await generatePaymentQr(createdOrder, transferNote);
        setPaymentQr(qr);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setQrLoading(false);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setCreating(false);
    }
  }, [creating, customDaysBounds, customDaysValid, machine?.machineId, order, parsedCustomDays, selected, selectedPackage, vi]);

  useEffect(() => {
    if (!paymentModalOpen || flowState !== 'SUCCESS') return;

    const timer = window.setTimeout(() => {
      closePaymentModal();
    }, 2500);

    return () => window.clearTimeout(timer);
  }, [closePaymentModal, flowState, paymentModalOpen]);

  useEffect(() => {
    if (!paymentModalOpen || !order || order.status !== 'WAITING') return;

    const timer = window.setInterval(() => {
      const expiresAt = Date.parse(order.expires_at);
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemainingSeconds(seconds);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [order, paymentModalOpen]);

  useEffect(() => {
    if (!paymentModalOpen || !order || order.status !== 'WAITING') return;

    const poller = window.setInterval(() => {
      void refreshOrderStatus();
    }, 3000);

    return () => window.clearInterval(poller);
  }, [order, paymentModalOpen, refreshOrderStatus]);

  useEffect(() => {
    if (!paymentModalOpen || !order || order.status !== 'WAITING' || remainingSeconds !== 0) return;
    void refreshOrderStatus();
  }, [order, paymentModalOpen, refreshOrderStatus, remainingSeconds]);

  const safePaymentError = error && /script\\.google\\.com|script\\.googleusercontent\\.com|Payment Gateway HTTPS request/i.test(error)
    ? (vi
      ? 'Không thể kết nối Payment Gateway. Vui lòng kiểm tra kết nối Internet và thử lại.'
      : 'Cannot connect to the Payment Gateway. Check your Internet connection and try again.')
    : error;

  return (
    <>
      <section className="rdvd-card rdvd-payment-card">
        <div className="rdvd-step">
          <b className="blue">$</b>
          <h2>{vi ? 'Kích hoạt bản quyền' : 'License activation'}</h2>
          <span>{catalog.length > 0 ? `${catalog.length}` : '—'}</span>
        </div>

        {loading ? (
          <div className="rdvd-payment-status">{vi ? 'Đang tải danh mục gói...' : 'Loading package catalog...'}</div>
        ) : error && !paymentModalOpen ? (
          <div className="rdvd-render-warning rdvd-payment-error">
            ⚠ {safePaymentError}
            <button type="button" className="rdvd-secondary" onClick={() => { void load(); }}>
              {vi ? 'Thử lại' : 'Retry'}
            </button>
          </div>
        ) : catalog.length === 0 ? (
          <div className="rdvd-payment-status">{vi ? 'Hiện chưa có gói thanh toán ACTIVE.' : 'No active payment package is available.'}</div>
        ) : (
          <>
            <div className="rdvd-form-field">
              <label>{vi ? 'Chọn gói' : 'Choose package'}</label>
              <select
                className="rdvd-select-wide"
                value={selectedPackage}
                disabled={creating || Boolean(order)}
                onChange={(event) => setSelectedPackage(event.target.value)}
              >
                {catalog.map((item) => (
                  <option key={item.package} value={item.package}>
                    {item.name} · {item.pricing_mode === 'FLEXIBLE_DAYS'
                      ? (vi ? 'Tùy số ngày' : 'Based on days')
                      : `${item.amount.toLocaleString('vi-VN')} ${item.currency}`}
                  </option>
                ))}
              </select>
            </div>

            {selected?.pricing_mode === 'FLEXIBLE_DAYS' && customDaysBounds && (
              <div className="rdvd-form-field">
                <label>{vi ? 'Số ngày sử dụng' : 'Number of days'}</label>
                <input
                  className="rdvd-select-wide"
                  type="number"
                  min={customDaysBounds.min}
                  max={customDaysBounds.max}
                  step={1}
                  value={customDays}
                  disabled={creating || Boolean(order)}
                  onChange={(event) => setCustomDays(event.target.value)}
                />
                <small style={{ color: '#71889b', fontSize: 8, marginTop: 4 }}>
                  {vi
                    ? `Cho phép từ ${customDaysBounds.min} đến ${customDaysBounds.max} ngày. Giá được Payment Gateway xác định.`
                    : `Allowed from ${customDaysBounds.min} to ${customDaysBounds.max} days. Price is determined by the Payment Gateway.`}
                </small>
              </div>
            )}

            {selected && (
              <div className="rdvd-payment-package-summary">
                <div>
                  <span>{vi ? 'Giá' : 'Price'}</span>
                  <strong>
                    {selected.pricing_mode === 'FLEXIBLE_DAYS'
                      ? (vi ? 'Do Payment Gateway tính' : 'Determined by Payment Gateway')
                      : `${selected.amount.toLocaleString('vi-VN')} ${selected.currency}`}
                  </strong>
                </div>
                <div>
                  <span>{vi ? 'Thời hạn' : 'Duration'}</span>
                  <strong>
                    {selected.pricing_mode === 'FLEXIBLE_DAYS'
                      ? `${customDays || '—'} ${vi ? 'ngày' : 'days'}`
                      : `${selected.duration_days} ${vi ? 'ngày' : 'days'}`}
                  </strong>
                </div>
                <div><span>{vi ? 'Thiết bị' : 'Devices'}</span><strong>{selected.device_limit}</strong></div>
              </div>
            )}

            <button
              type="button"
              className="rdvd-action blue-action"
              disabled={!machine || !selectedPackage || creating || Boolean(order) || !customDaysValid}
              onClick={() => { void handleCreateOrder(); }}
            >
              {creating ? (vi ? 'Đang tạo đơn...' : 'Creating order...') : (vi ? 'Tạo đơn thanh toán' : 'Create payment order')}
            </button>

            {order && (
              <div className="rdvd-payment-order-summary">
                <div className="rdvd-payment-order-title">✓ {vi ? 'Đơn đang chờ thanh toán' : 'Payment order pending'}</div>
                <div><span>{vi ? 'Mã đơn' : 'Order ID'}</span><strong>{order.order_id}</strong></div>
                <div><span>{vi ? 'Số tiền' : 'Amount'}</span><strong>{order.amount.toLocaleString('vi-VN')} {order.currency}</strong></div>
                <div><span>{vi ? 'Trạng thái' : 'Status'}</span><strong>{order.status}</strong></div>
              </div>
            )}
          </>
        )}
      </section>

      {activeLicense && activeLicense.status === 'ACTIVE' && (
        <div className="rdvd-payment-order-summary">
          <div className="rdvd-payment-order-title">✓ {vi ? 'Bản quyền đang hoạt động' : 'License is active'}</div>
          <div><span>{vi ? 'Gói' : 'Package'}</span><strong>{activeLicense.package_name}</strong></div>
          <div><span>{vi ? 'Hết hạn' : 'Expires'}</span><strong>{new Date(activeLicense.expires_at).toLocaleString(vi ? 'vi-VN' : 'en-GB')}</strong></div>
          <div><span>{vi ? 'Thiết bị' : 'Device'}</span><strong>{activeLicense.machine_id === machine?.machineId ? (vi ? 'Máy này' : 'This device') : activeLicense.machine_id}</strong></div>
        </div>
      )}

      {paymentModalOpen && order && (
        <PaymentModal
          language={language}
          order={order}
          paymentQr={paymentQr}
          qrLoading={qrLoading}
          remainingSeconds={remainingSeconds}
          cancelling={cancelling}
          checking={checking}
          error={safePaymentError}
          flowState={flowState}
          activationStep={activationStep}
          license={activeLicense}
          onCancel={() => { void handleCancelOrder(); }}
          onClose={closePaymentModal}
          onRetry={handleRetryActivation}
        />
      )}
    </>
  );
}
