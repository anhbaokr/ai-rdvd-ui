export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "installed"
  | "unsupported"
  | "error";

export interface AppUpdateReleaseInfo {
  currentVersion: string;
  version: string;
  date: string | null;
  notes: string;
}

export interface AppUpdateState {
  status: AppUpdateStatus;
  currentVersion: string;
  release: AppUpdateReleaseInfo | null;
  downloadedBytes: number;
  totalBytes: number | null;
  progress: number | null;
  message: string;
  error: string | null;
  lastCheckedAt: number | null;
}

export type AppUpdateDownloadEvent =
  | { event: "Started"; data: { contentLength?: number } }
  | { event: "Progress"; data: { chunkLength: number } }
  | { event: "Finished" };

export const FALLBACK_APP_VERSION = "0.1.0";

export const INITIAL_APP_UPDATE_STATE: AppUpdateState = {
  status: "idle",
  currentVersion: FALLBACK_APP_VERSION,
  release: null,
  downloadedBytes: 0,
  totalBytes: null,
  progress: null,
  message: "Sẵn sàng kiểm tra phiên bản mới.",
  error: null,
  lastCheckedAt: null,
};

function normalizedByteCount(value: number | undefined): number | null {
  if (!Number.isFinite(value) || value === undefined || value <= 0) {
    return null;
  }
  return Math.round(value);
}

export function calculateAppUpdateProgress(
  downloadedBytes: number,
  totalBytes: number | null,
): number | null {
  if (!totalBytes || totalBytes <= 0) return null;
  return Math.min(1, Math.max(0, downloadedBytes / totalBytes));
}

export function applyAppUpdateDownloadEvent(
  state: AppUpdateState,
  event: AppUpdateDownloadEvent,
): AppUpdateState {
  if (event.event === "Started") {
    const totalBytes = normalizedByteCount(event.data.contentLength);
    return {
      ...state,
      status: "downloading",
      downloadedBytes: 0,
      totalBytes,
      progress: totalBytes ? 0 : null,
      message: "Đang tải gói cập nhật...",
      error: null,
    };
  }

  if (event.event === "Progress") {
    const downloadedBytes = Math.max(
      0,
      state.downloadedBytes + Math.max(0, event.data.chunkLength),
    );
    return {
      ...state,
      status: "downloading",
      downloadedBytes,
      progress: calculateAppUpdateProgress(downloadedBytes, state.totalBytes),
      message: "Đang tải gói cập nhật...",
      error: null,
    };
  }

  return {
    ...state,
    status: "downloading",
    downloadedBytes: state.totalBytes ?? state.downloadedBytes,
    progress: 1,
    message: "Đã tải xong, đang hoàn tất cài đặt...",
    error: null,
  };
}

export type AppUpdateErrorStage = "check" | "install";

export function appUpdateErrorMessage(
  error: unknown,
  stage: AppUpdateErrorStage = "check",
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Lỗi không xác định.";
  const normalized = raw.toLowerCase();

  if (
    stage === "check" &&
    (normalized.includes("404") ||
      normalized.includes("not found") ||
      normalized.includes("latest.json"))
  ) {
    return "Chưa có bản phát hành updater trên GitHub Releases. Hãy tạo release có latest.json rồi thử lại.";
  }

  if (
    normalized.includes("network") ||
    normalized.includes("dns") ||
    normalized.includes("connect") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout")
  ) {
    return "Không thể kết nối máy chủ cập nhật. Hãy kiểm tra Internet rồi thử lại.";
  }

  if (
    normalized.includes("signature") ||
    normalized.includes("minisign") ||
    normalized.includes("public key")
  ) {
    return "Chữ ký gói cập nhật không hợp lệ. AI RDvD đã từ chối cài đặt gói này.";
  }

  if (stage === "install") {
    return `Không thể tải/cài đặt bản cập nhật: ${raw}`;
  }

  return `Không thể hoàn tất kiểm tra cập nhật: ${raw}`;
}

export function formatAppUpdateBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const unitIndex = Math.min(
    units.length - 1,
    Math.floor(Math.log(bytes) / Math.log(1024)),
  );
  const value = bytes / 1024 ** unitIndex;
  return `${value >= 10 || unitIndex === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

export function appUpdateProgressLabel(state: AppUpdateState): string {
  if (state.progress !== null) return `${Math.round(state.progress * 100)}%`;
  if (state.downloadedBytes > 0) {
    return `${formatAppUpdateBytes(state.downloadedBytes)} đã tải`;
  }
  return "Đang chuẩn bị...";
}
