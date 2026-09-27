import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  TtsEnvironmentResult,
  TtsGenerationResult,
  TtsProgress,
  TtsCue,
  Voice,
  VoicePreviewResult,
} from '../types';

export interface GenerateTtsRequest {
  text: string;
  voiceId: Voice;
  speed: number;
  pitch: number;
  cues?: TtsCue[];
}

export const isTauriRuntime = () => Boolean(
  (window as typeof window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__,
);

export async function checkTtsEnvironment(): Promise<TtsEnvironmentResult> {
  if (!isTauriRuntime()) {
    return {
      ready: false,
      pythonPath: null,
      workerPath: null,
      audioDirectory: 'E:\\ai-rdvd-ui\\audio',
      outputDirectory: 'E:\\ai-rdvd-ui\\output\\tts',
      logFilePath: '%LOCALAPPDATA%\\com.airdvd.app\\logs\\ai-rdvd-technical.log',
      message: 'TTS chỉ chạy trong ứng dụng desktop Tauri.',
      diagnostics: ['Không phát hiện Tauri runtime. Hãy chạy npm run tauri:dev.'],
    };
  }
  return invoke<TtsEnvironmentResult>('check_tts_environment');
}

export async function loadVoicePreview(voiceId: Voice): Promise<VoicePreviewResult> {
  if (!isTauriRuntime()) throw new Error('Nghe thử MP3 chỉ khả dụng trong ứng dụng desktop Tauri.');
  return invoke<VoicePreviewResult>('load_voice_preview', { voiceId });
}

export async function generateTts(request: GenerateTtsRequest): Promise<TtsGenerationResult> {
  if (!isTauriRuntime()) throw new Error('VieNeu TTS chỉ khả dụng trong ứng dụng desktop Tauri.');
  return invoke<TtsGenerationResult>('generate_tts', { request });
}

export async function listenTtsProgress(handler: (progress: TtsProgress) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  return listen<TtsProgress>('tts-progress', (event) => handler(event.payload));
}

export async function appendTechnicalLog(lines: readonly string[]): Promise<void> {
  if (!isTauriRuntime() || !lines.length) return;
  await invoke('append_technical_log', { lines: [...lines] });
}

export async function clearTechnicalLog(): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('clear_technical_log');
}

export async function openTechnicalLogDirectory(): Promise<string> {
  if (!isTauriRuntime()) throw new Error('Thư mục log kỹ thuật chỉ khả dụng trong ứng dụng desktop Tauri.');
  return invoke<string>('open_technical_log_directory');
}
