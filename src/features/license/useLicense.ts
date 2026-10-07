import { useCallback, useEffect, useRef, useState } from 'react';
import {
  activateDevice,
  checkLicense,
  clearLicenseToken,
  getLocalLicenseState,
  getMachineIdentity,
  saveLicenseState,
} from './licenseService';
import { OFFLINE_GRACE_MS } from './licensePolicy';
import type { LicenseRecord } from './licenseContracts';

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

function offlineGraceDecision(
  localState: Awaited<ReturnType<typeof getLocalLicenseState>>,
  machineId: string,
): { status: 'ACTIVE' | 'EXPIRED' | 'UNAVAILABLE'; license?: Omit<LicenseRecord, 'license_token'> } {
  if (!localState || localState.schemaVersion < 2 || !localState.license) {
    return { status: 'UNAVAILABLE' };
  }

  if (localState.machineId && localState.machineId !== machineId) {
    return { status: 'UNAVAILABLE' };
  }

  const now = Date.now();
  const graceUntil = Number(localState.offlineGraceUntilMs);
  if (!Number.isFinite(graceUntil) || now >= graceUntil) {
    return { status: 'UNAVAILABLE' };
  }

  const expiresAtMs = Date.parse(localState.license.expires_at);
  if (!Number.isFinite(expiresAtMs) || now >= expiresAtMs) {
    return { status: 'EXPIRED', license: localState.license };
  }

  if (localState.license.status !== 'ACTIVE') {
    return { status: 'UNAVAILABLE' };
  }

  return { status: 'ACTIVE', license: localState.license };
}

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

    const activateFromVerifiedLicense = async (
      token: string,
      identityMachineId: string,
      license: Omit<LicenseRecord, 'license_token'>,
    ) => {
      const verifiedAtMs = Date.now();
      const offlineGraceUntilMs = verifiedAtMs + OFFLINE_GRACE_MS;
      try {
        await saveLicenseState({
          licenseToken: token,
          machineId: identityMachineId,
          lastVerifiedAtMs: verifiedAtMs,
          offlineGraceUntilMs,
          license,
        });
        addLog('OFFLINE_GRACE_SAVED', 'LICENSE');
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
          await activateFromVerifiedLicense(localState.licenseToken, identity.machineId, activeLicense);
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
      await activateFromVerifiedLicense(localState.licenseToken, identity.machineId, activeLicense);
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
        const offline = offlineGraceDecision(localState, machineId);
        if (offline.status === 'EXPIRED') {
          addLog('OFFLINE_LICENSE_EXPIRED', 'LICENSE');
          setState({
            status: 'EXPIRED',
            machineId,
            license: offline.license ?? null,
            error: 'License đã hết hạn.',
          });
          return;
        }
        if (offline.status === 'ACTIVE' && offline.license) {
          addLog('OFFLINE_GRACE_ACTIVE', 'LICENSE');
          setState({
            status: 'ACTIVE',
            machineId,
            license: offline.license,
            error: null,
          });
          return;
        }
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
