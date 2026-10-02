import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import type {
  RecognitionLogEvent,
  RecognitionProgress,
  RecognitionRequest,
  RecognitionResult,
} from '../types';
import { isTauriRuntime } from './tts';

export async function chooseVideoFilePath(): Promise<string | null> {
  if (!isTauriRuntime()) return null;
  const selected = await open({
    multiple: false,
    directory: false,
    filters: [
      {
        name: 'Video',
        extensions: ['mp4', 'mkv', 'avi', 'mov', 'webm', 'm4v', 'ts'],
      },
    ],
  });
  return typeof selected === 'string' ? selected : null;
}

export async function startRecognition(request: RecognitionRequest): Promise<RecognitionResult> {
  if (!isTauriRuntime()) {
    throw new Error('Recognition is only available in the Tauri desktop application.');
  }
  return invoke<RecognitionResult>('start_recognition', { request });
}

export async function listenRecognitionLog(handler: (payload: RecognitionLogEvent) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  return listen<RecognitionLogEvent>('recognition-log', (event) => handler(event.payload));
}

export async function listenRecognitionProgress(handler: (payload: RecognitionProgress) => void): Promise<UnlistenFn> {
  if (!isTauriRuntime()) return () => undefined;
  return listen<RecognitionProgress>('recognition-progress', (event) => handler(event.payload));
}
