import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateDevice,
  checkLicense,
  clearLicenseToken,
  getLocalLicenseState,
  getMachineIdentity,
  saveLicenseState,
  verifyOfflineEntitlement,
} from './licenseService';
import { OFFLINE_GRACE_MS } from './licensePolicy';
import type {
  LicenseRecord,
  OfflineEntitlementEnvelope,
  OfflineEntitlementVerification,
} from './licenseContracts';

export type LicenseGateStatus =
  | 'CHECKING'
  | 'NO_LICENSE'
  | 'ACTIVE'
  | 'EXPIRED'
  | 'INVALID'
  | 'MACHINE_MISMATCH'
  | 'DEVICE_LIMIT'
  | 'NETWORK_ERROR';

export interface LicenseGateState {
  status: LicenseGateStatus;
  machineId: string | null;
  license: Omit<LicenseRecord, 'license_token'> | null;
  error: string | null;
}

function classifyLicenseError(error: string | undefined, status?: string): LicenseGateStatus {
  const code = (error ?? '').toUpperCase();
  const licenseStatus = (status ?? '').toUpperCase();

  if (code.includes('EXPIRED') || licenseStatus === 'EXPIRED') return 'EXPIRED';
  if (code.includes('MACHINE_MISMATCH')) return 'MACHINE_MISMATCH';
  if (code.includes('DEVICE_LIMIT')) return 'DEVICE_LIMIT';
  return 'INVALID';
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function entitlementFrom(
  ...candidates: Array<OfflineEntitlementEnvelope | undefined | null>
): OfflineEntitlementEnvelope | null {
  return candidates.find(Boolean) ?? null;
}

function isOfflineExpiryError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('hết offline grace') ||
    normalized.includes('đã hết hạn') ||
    normalized.includes('license trong offline entitlement đã hết hạn')
  );
}

function assertLocalSnapshotMatchesVerifiedEntitlement(
  license: Omit<LicenseRecord, 'license_token'>,
  verification: OfflineEntitlementVerification,
  expectedMachineId: string,
): void {
  if (license.machine_id !== expectedMachineId) {
    throw new Error('OFFLINE_LOCAL_MACHINE_ID_MISMATCH');
  }
  if (license.status !== 'ACTIVE') {
    throw new Error('OFFLINE_LOCAL_STATUS_MISMATCH');
  }
  if (license.license_id !== verification.licenseId) {
    throw new Error('OFFLINE_LOCAL_LICENSE_ID_MISMATCH');
  }
  if (license.order_id && verification.orderId && license.order_id !== verification.orderId) {
    throw new Error('OFFLINE_LOCAL_ORDER_ID_MISMATCH');
  }
  if (license.package !== verification.package) {
    throw new Error('OFFLINE_LOCAL_PACKAGE_MISMATCH');
  }
  if (typeof verification.licenseExpiresAtMs === 'number') {
    const localExpiryMs = Date.parse(license.expires_at);
    if (!Number.isFinite(localExpiryMs) || localExpiryMs !== verification.licenseExpiresAtMs) {
      throw new Error('OFFLINE_LOCAL_EXPIRY_MISMATCH');
    }
  }
}

/**
 * SECURITY-10D:
 * Offline authorization is Rust-authoritative.
 *
 * TypeScript never grants offline ACTIVE from local timestamps/status alone.
 * The only offline path to ACTIVE is a signed entitlement accepted by Rust.
 */
export function useLicense(addLog: (message: string, category?: string) => void) {
  const [state, setState] = useState<LicenseGateState>({
    status: 'CHECKING',
    machineId: null,
    license: null,
    error: null,
  });
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    let stage: 'local' | 'machine' | 'check' | 'activate' = 'local';
    let localState: Awaited<ReturnType<typeof getLocalLicenseState>> = null;
    let machineId: string | null = null;
    setState((current) => ({ ...current, status: 'CHECKING', error: null }));

    const persistVerifiedOnlineLicense = async (
      token: string,
      identityMachineId: string,
      license: Omit<LicenseRecord, 'license_token'>,
      entitlement: OfflineEntitlementEnvelope | null,
    ) => {
      const verifiedAtMs = Date.now();
      const persistedLicenseBase = { ...license };
      delete persistedLicenseBase.offline_entitlement;
      let persistedLicense: Omit<LicenseRecord, 'license_token'> = persistedLicenseBase;
      let offlineGraceUntilMs = verifiedAtMs + OFFLINE_GRACE_MS;

      if (entitlement) {
        try {
          const verification = await verifyOfflineEntitlement(entitlement);
          assertLocalSnapshotMatchesVerifiedEntitlement(license, verification, identityMachineId);

          persistedLicense = {
            ...license,
            offline_entitlement: entitlement,
          };
          offlineGraceUntilMs = verification.offlineGraceExpiresAtMs;
          addLog('OFFLINE_ENTITLEMENT_VERIFIED_AND_SAVED', 'LICENSE');
        } catch (cause) {
          // Online authorization remains server-authoritative. If the signed
          // offline entitlement is invalid, online use continues but offline
          // authorization is intentionally disabled for this snapshot.
          addLog(`OFFLINE_ENTITLEMENT_SAVE_REJECTED: ${errorMessage(cause)}`, 'LICENSE');
        }
      } else {
        addLog('OFFLINE_ENTITLEMENT_NOT_ISSUED', 'LICENSE');
      }

      try {
        await saveLicenseState({
          licenseToken: token,
          machineId: identityMachineId,
          lastVerifiedAtMs: verifiedAtMs,
          offlineGraceUntilMs,
          license: persistedLicense,
        });
        addLog('LOCAL_LICENSE_STATE_SAVED', 'LICENSE');
      } catch (cause) {
        addLog(`LOCAL_STATE_SAVE_FAILED: ${errorMessage(cause)}`, 'LICENSE');
      }
    };

    try {
      localState = await getLocalLicenseState();
      if (requestId !== requestIdRef.current) return;

      if (!localState?.licenseToken) {
        addLog('TOKEN_NOT_FOUND', 'LICENSE');
        setState({ status: 'NO_LICENSE', machineId: null, license: null, error: null });
        return;
      }

      addLog('TOKEN_FOUND', 'LICENSE');

      stage = 'machine';
      const identity = await getMachineIdentity();
      machineId = identity.machineId;
      if (requestId !== requestIdRef.current) return;
      addLog('MACHINE_ID_READY', 'LICENSE');

      if (localState.machineId && localState.machineId !== identity.machineId) {
        addLog('LOCAL_MACHINE_MISMATCH', 'LICENSE');
        setState({
          status: 'MACHINE_MISMATCH',
          machineId: identity.machineId,
          license: localState.license ?? null,
          error: 'License local thuộc về máy khác.',
        });
        return;
      }

      stage = 'check';
      addLog('CHECK_START', 'LICENSE');
      const checkResponse = await checkLicense(localState.licenseToken, identity.machineId);
      if (requestId !== requestIdRef.current) return;

      if (!checkResponse.success || !checkResponse.license) {
        const status = classifyLicenseError(checkResponse.error);
        if ((checkResponse.error ?? '').toUpperCase().includes('LICENSE_NOT_FOUND')) {
          void clearLicenseToken().catch(() => undefined);
        }
        addLog(`CHECK_FAILED: ${checkResponse.error ?? 'UNKNOWN'}`, 'LICENSE');
        setState({
          status,
          machineId: identity.machineId,
          license: null,
          error: checkResponse.error ?? 'Không xác thực được bản quyền.',
        });
        return;
      }

      if (checkResponse.license.status !== 'ACTIVE') {
        const status = classifyLicenseError(undefined, checkResponse.license.status);
        addLog(`CHECK_FAILED: ${checkResponse.license.status}`, 'LICENSE');
        setState({
          status,
          machineId: identity.machineId,
          license: checkResponse.license,
          error: `License status: ${checkResponse.license.status}`,
        });
        return;
      }

      stage = 'activate';
      addLog('CHECK_ACTIVE', 'LICENSE');
      addLog('ACTIVATION_START', 'LICENSE');
      const activation = await activateDevice(
        localState.licenseToken,
        identity.machineId,
        identity.machineId,
      );
      if (requestId !== requestIdRef.current) return;

      if (!activation.success) {
        const status = classifyLicenseError(activation.error, activation.license?.status);
        if ((activation.error ?? '').toUpperCase().includes('DEVICE_ALREADY_ACTIVE')) {
          const activeLicense = activation.license ?? checkResponse.license;
          const entitlement = entitlementFrom(
            activation.offline_entitlement,
            activeLicense.offline_entitlement,
            checkResponse.offline_entitlement,
            checkResponse.license.offline_entitlement,
          );

          await persistVerifiedOnlineLicense(
            localState.licenseToken,
            identity.machineId,
            activeLicense,
            entitlement,
          );
          addLog('ACTIVATION_ACTIVE', 'LICENSE');
          setState({
            status: 'ACTIVE',
            machineId: identity.machineId,
            license: activeLicense,
            error: null,
          });
          return;
        }

        addLog(`ACTIVATION_FAILED: ${activation.error ?? 'UNKNOWN'}`, 'LICENSE');
        setState({
          status,
          machineId: identity.machineId,
          license: activation.license ?? checkResponse.license,
          error: activation.error ?? 'Không kích hoạt được thiết bị.',
        });
        return;
      }

      const activeLicense = activation.license ?? checkResponse.license;
      const entitlement = entitlementFrom(
        activation.offline_entitlement,
        activeLicense.offline_entitlement,
        checkResponse.offline_entitlement,
        checkResponse.license.offline_entitlement,
      );

      await persistVerifiedOnlineLicense(
        localState.licenseToken,
        identity.machineId,
        activeLicense,
        entitlement,
      );
      addLog('ACTIVATION_ACTIVE', 'LICENSE');
      setState({
        status: 'ACTIVE',
        machineId: identity.machineId,
        license: activeLicense,
        error: null,
      });
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      const message = errorMessage(cause);

      if (stage !== 'local' && machineId) {
        const localLicense = localState?.license;
        const entitlement = localLicense?.offline_entitlement;

        if (localLicense && entitlement) {
          try {
            const verification = await verifyOfflineEntitlement(entitlement);
            if (requestId !== requestIdRef.current) return;

            assertLocalSnapshotMatchesVerifiedEntitlement(localLicense, verification, machineId);
            addLog('OFFLINE_ENTITLEMENT_ACTIVE', 'LICENSE');
            setState({
              status: 'ACTIVE',
              machineId,
              license: localLicense,
              error: null,
            });
            return;
          } catch (offlineCause) {
            const offlineMessage = errorMessage(offlineCause);
            addLog(`OFFLINE_ENTITLEMENT_REJECTED: ${offlineMessage}`, 'LICENSE');

            if (isOfflineExpiryError(offlineMessage)) {
              setState({
                status: 'EXPIRED',
                machineId,
                license: localLicense,
                error: offlineMessage,
              });
              return;
            }

            setState({
              status: 'INVALID',
              machineId,
              license: localLicense,
              error: offlineMessage,
            });
            return;
          }
        }

        addLog('OFFLINE_ENTITLEMENT_UNAVAILABLE', 'LICENSE');
      }

      if (stage === 'local') {
        addLog(`LOCAL_STATE_ERROR: ${message}`, 'LICENSE');
        setState((current) => ({ ...current, status: 'INVALID', error: message }));
      } else if (stage === 'machine') {
        addLog(`MACHINE_ID_ERROR: ${message}`, 'LICENSE');
        setState((current) => ({ ...current, status: 'INVALID', error: message }));
      } else {
        addLog('OFFLINE', 'LICENSE');
        setState((current) => ({
          ...current,
          status: 'NETWORK_ERROR',
          error: message,
        }));
      }
    }
  }, [addLog]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    state,
    refresh,
  };
}
