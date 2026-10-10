export type RenderEnvironmentStatus = 'READY' | 'NOT_READY';

export interface RenderEnvironmentResult {
  status: RenderEnvironmentStatus;
  ready: boolean;
  ffmpegPath: string | null;
  ffmpegVersion: string | null;
  message: string;
  diagnostics: string[];
}
