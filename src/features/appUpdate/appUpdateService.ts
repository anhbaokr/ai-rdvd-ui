import { getVersion } from "@tauri-apps/api/app";
import { relaunch } from "@tauri-apps/plugin-process";
import { check, type DownloadEvent, type Update } from "@tauri-apps/plugin-updater";
import type { AppUpdateDownloadEvent, AppUpdateReleaseInfo } from "./appUpdateModel";

export interface AppUpdateCandidate {
  release: AppUpdateReleaseInfo;
  downloadAndInstall(onEvent: (event: AppUpdateDownloadEvent) => void): Promise<void>;
  close(): Promise<void>;
}

export interface AppUpdateGateway {
  isSupported(): boolean;
  getCurrentVersion(): Promise<string>;
  checkForUpdate(): Promise<AppUpdateCandidate | null>;
  relaunch(): Promise<void>;
}

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  const runtimeWindow = window as unknown as Record<string, unknown>;
  return Boolean(runtimeWindow.__TAURI_INTERNALS__);
}

function normalizeReleaseNotes(body: string | undefined): string {
  const normalized = body?.trim();
  return normalized || "Nhà phát triển chưa cung cấp ghi chú cho phiên bản này.";
}

function candidateFromUpdate(update: Update): AppUpdateCandidate {
  return {
    release: {
      currentVersion: update.currentVersion,
      version: update.version,
      date: update.date ?? null,
      notes: normalizeReleaseNotes(update.body),
    },
    async downloadAndInstall(onEvent) {
      await update.download((event: DownloadEvent) => {
        switch (event.event) {
          case "Started":
            onEvent({ event: "Started", data: { contentLength: event.data.contentLength } });
            break;
          case "Progress":
            onEvent({ event: "Progress", data: { chunkLength: event.data.chunkLength } });
            break;
          case "Finished":
            onEvent({ event: "Finished" });
            break;
        }
      });

      await update.install({ restartAfterInstall: true });
    },
    close() {
      return update.close();
    },
  };
}

export const tauriAppUpdateGateway: AppUpdateGateway = {
  isSupported: isTauriRuntime,
  getCurrentVersion() {
    return getVersion();
  },
  async checkForUpdate() {
    const update = await check({ timeout: 30_000 });
    return update ? candidateFromUpdate(update) : null;
  },
  relaunch,
};
