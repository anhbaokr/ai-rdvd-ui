import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  TranslationEnvironmentResult,
  TranslationProgress,
  TranslationRunResult,
  TranslationSegmentInput,
  SavedTranslationFile,
} from '../types';
import { isTauriRuntime } from './tts';

export async function checkTranslationEnvironment(): Promise<TranslationEnvironmentResult> {
  if (!isTauriRuntime()) {
    return {
      ready: false,
      pythonPath: null,
      workerPath: null,
      assetsRoot: 'translation-assets',
      outputDirectory: '%LOCALAPPDATA%\\com.airdvd.app\\output\\translation',
      logFilePath: '%LOCALAPPDATA%\\com.airdvd.app\\logs\\ai-rdvd-technical.log',
      message: 'Mô-đun dịch chỉ chạy trong ứng dụng desktop Tauri.',
      diagnostics: ['Không phát hiện Tauri runtime. Hãy chạy npm run tauri:dev.'],
    };
  }
  return invoke<TranslationEnvironmentResult>('check_translation_environment');
}

export async function installTranslationEnvironment(): Promise<TranslationEnvironmentResult> {
  if (!isTauriRuntime()) throw new Error('Trình cài mô-đun dịch chỉ khả dụng trong ứng dụng desktop Tauri.');
  return invoke<TranslationEnvironmentResult>('install_translation_environment');
}

export async function translateSegments(jobId: string, segments: TranslationSegmentInput[], sourceLanguage = 'zh', targetLanguage = 'vi', resume = true) {
  if (!isTauriRuntime()) throw new Error('Dịch Hachimi chỉ khả dụng trong ứng dụng desktop Tauri.');
  return invoke<TranslationRunResult>('translate_segments', { request: { jobId, segments, sourceLanguage, targetLanguage, resume } });
}

export async function cancelTranslation(jobId: string) {
  if (!isTauriRuntime()) return;
  await invoke('cancel_translation', { jobId });
}

export async function saveTranslationFile(fileName: string, content: string): Promise<SavedTranslationFile> {
  if (!isTauriRuntime()) throw new Error('Chỉ có thể lưu bản dịch trong ứng dụng desktop Tauri.');
  return invoke<SavedTranslationFile>('save_translation_file', { request: { fileName, content } });
}

export async function openTranslationOutputDirectory(): Promise<string> {
  if (!isTauriRuntime()) throw new Error('Thư mục bản dịch chỉ khả dụng trong ứng dụng desktop Tauri.');
  return invoke<string>('open_translation_output_directory');
}

export async function listenTranslationProgress(handler: (progress: TranslationProgress) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  return listen<TranslationProgress>('translation-progress', (event) => handler(event.payload));
}
