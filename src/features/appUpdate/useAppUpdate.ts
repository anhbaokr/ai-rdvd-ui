import { useCallback, useEffect, useRef, useState } from "react";
import {
  appUpdateErrorMessage,
  applyAppUpdateDownloadEvent,
  INITIAL_APP_UPDATE_STATE,
  type AppUpdateState,
} from "./appUpdateModel";
import {
  tauriAppUpdateGateway,
  type AppUpdateCandidate,
  type AppUpdateGateway,
} from "./appUpdateService";

export interface AppUpdateController {
  state: AppUpdateState;
  checkForUpdates(silent?: boolean): Promise<void>;
  downloadAndInstall(): Promise<void>;
  relaunch(): Promise<void>;
}

export function useAppUpdate(
  gateway: AppUpdateGateway = tauriAppUpdateGateway,
): AppUpdateController {
  const [state, setState] = useState<AppUpdateState>(INITIAL_APP_UPDATE_STATE);
  const candidateRef = useRef<AppUpdateCandidate | null>(null);
  const checkingRef = useRef(false);
  const installingRef = useRef(false);

  const closeCandidate = useCallback(async () => {
    const candidate = candidateRef.current;
    candidateRef.current = null;
    if (candidate) await candidate.close().catch(() => undefined);
  }, []);

  const checkForUpdates = useCallback(async (silent = false) => {
    if (checkingRef.current || installingRef.current) return;

    if (!gateway.isSupported()) {
      setState((current) => ({
        ...current,
        status: "unsupported",
        message: "Tính năng cập nhật chỉ hoạt động trong bản desktop của AI RDvD.",
        error: null,
      }));
      return;
    }

    checkingRef.current = true;
    setState((current) => ({
      ...current,
      status: "checking",
      message: "Đang kiểm tra phiên bản mới...",
      error: null,
    }));

    try {
      const currentVersion = await gateway.getCurrentVersion();
      await closeCandidate();
      const candidate = await gateway.checkForUpdate();
      const checkedAt = Date.now();

      if (!candidate) {
        setState((current) => ({
          ...current,
          status: "up-to-date",
          currentVersion,
          release: null,
          downloadedBytes: 0,
          totalBytes: null,
          progress: null,
          message: "Bạn đang dùng phiên bản mới nhất.",
          error: null,
          lastCheckedAt: checkedAt,
        }));
        return;
      }

      candidateRef.current = candidate;
      setState((current) => ({
        ...current,
        status: "available",
        currentVersion,
        release: candidate.release,
        downloadedBytes: 0,
        totalBytes: null,
        progress: null,
        message: `Đã tìm thấy phiên bản ${candidate.release.version}.`,
        error: null,
        lastCheckedAt: checkedAt,
      }));
    } catch (error) {
      if (silent) {
        setState((current) => ({
          ...current,
          status: "idle",
          message: "Sẵn sàng kiểm tra phiên bản mới.",
          error: null,
          lastCheckedAt: Date.now(),
        }));
      } else {
        const message = appUpdateErrorMessage(error, "check");
        setState((current) => ({
          ...current,
          status: "error",
          message,
          error: message,
          lastCheckedAt: Date.now(),
        }));
      }
    } finally {
      checkingRef.current = false;
    }
  }, [closeCandidate, gateway]);

  const downloadAndInstall = useCallback(async () => {
    const candidate = candidateRef.current;
    if (!candidate || installingRef.current) return;

    installingRef.current = true;
    setState((current) => ({
      ...current,
      status: "downloading",
      downloadedBytes: 0,
      totalBytes: null,
      progress: null,
      message: "Đang chuẩn bị tải gói cập nhật...",
      error: null,
    }));

    try {
      await candidate.downloadAndInstall((event) => {
        setState((current) => applyAppUpdateDownloadEvent(current, event));
      });
      await closeCandidate();
      setState((current) => ({
        ...current,
        status: "installed",
        progress: 1,
        message: "Đã cài đặt bản cập nhật. Hãy khởi động lại AI RDvD.",
        error: null,
      }));
    } catch (error) {
      console.error("[AI RDvD] Updater install failed", error);
      const message = appUpdateErrorMessage(error, "install");
      setState((current) => ({
        ...current,
        status: "available",
        message,
        error: message,
      }));
    } finally {
      installingRef.current = false;
    }
  }, [closeCandidate]);

  const relaunchApp = useCallback(async () => {
    if (!gateway.isSupported()) return;
    setState((current) => ({ ...current, message: "Đang khởi động lại AI RDvD...", error: null }));
    try {
      await gateway.relaunch();
    } catch (error) {
      const message = appUpdateErrorMessage(error);
      setState((current) => ({ ...current, status: "error", message, error: message }));
    }
  }, [gateway]);

  useEffect(() => {
    let cancelled = false;

    if (!gateway.isSupported()) {
      setState((current) => ({
        ...current,
        status: "unsupported",
        message: "Tính năng cập nhật chỉ hoạt động trong bản desktop của AI RDvD.",
      }));
      return;
    }

    void gateway.getCurrentVersion().then((currentVersion) => {
      if (!cancelled) setState((current) => ({ ...current, currentVersion }));
    }).catch(() => undefined);

    const timer = window.setTimeout(() => {
      if (!cancelled) void checkForUpdates(true);
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      void closeCandidate();
    };
  }, [checkForUpdates, closeCandidate, gateway]);

  return { state, checkForUpdates, downloadAndInstall, relaunch: relaunchApp };
}
