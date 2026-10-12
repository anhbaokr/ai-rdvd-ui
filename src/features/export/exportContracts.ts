export type RenderEnvironmentStatus = 'READY' | 'NOT_READY';

export interface RenderEnvironmentResult {
  status: RenderEnvironmentStatus;
  ready: boolean;
  ffmpegPath: string | null;
  ffmpegVersion: string | null;
  message: string;
  diagnostics: string[];
}

export type ExportFormat = 'mp4';
export type ExportVideoCodec = 'h264';
export type ExportAudioCodec = 'aac';
export type ExportAudioMode = 'reduce' | 'keep' | 'mute';

export interface ExportVideoSettings {
  codec: ExportVideoCodec;
  crf: number;
  preset: string;
}

export interface ExportAudioSettings {
  mode: ExportAudioMode;
  sourceGain: number;
  dubbedGain: number;
  codec: ExportAudioCodec;
  bitrateKbps: number;
}

export interface ExportSubtitleSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface ExportSubtitleStyle {
  stageWidth: number;
  stageHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outline: boolean;
  outlineWidth: number;
}

export interface ExportSubtitleSettings {
  enabled: boolean;
  segments: ExportSubtitleSegment[];
  style: ExportSubtitleStyle;
}

export interface ExportLogoSettings {
  enabled: boolean;
  path: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportRequestV1 {
  schemaVersion: 1;
  jobId: string;
  sourceVideoPath: string;
  sourceDurationMs: number;
  dubbedAudioPath: string | null;
  outputPath: string;
  format: ExportFormat;
  video: ExportVideoSettings;
  audio: ExportAudioSettings;
  subtitles: ExportSubtitleSettings;
  logo: ExportLogoSettings;
}

export type RenderErrorCode =  | 'EXPORT_REQUEST_INVALID'  | 'LOGO_DATA_INVALID'


  | 'FFMPEG_NOT_FOUND'
  | 'FFMPEG_UNUSABLE'
  | 'SOURCE_VIDEO_MISSING'
  | 'SOURCE_VIDEO_NOT_NATIVE'
  | 'DUBBED_AUDIO_MISSING'
  | 'OUTPUT_PATH_INVALID'
  | 'OUTPUT_EXISTS'
  | 'SUBTITLE_DATA_INVALID'
  | 'LOGO_NOT_SUPPORTED_YET'
  | 'AUDIO_MODE_NOT_SUPPORTED_YET'
  | 'REQUEST_INVALID'
  | 'FFMPEG_START_FAILED'
  | 'FFMPEG_EXIT_FAILED'
  | 'FINALIZE_FAILED'  | 'RENDER_CANCELLED'

  | 'RENDER_TASK_INTERRUPTED';

export interface RenderError {
  code: RenderErrorCode;
  message: string;
  diagnostics: string[];
}

export interface RenderProgressEvent {
  jobId: string;
  status: 'PREPARING' | 'RENDERING' | 'FINALIZING' | 'COMPLETED' | 'CANCELLED';
  progress: number;
  outTimeMs: number;
  durationMs: number;
  speed: string | null;
}

export interface RenderLogEvent {
  jobId: string;
  level: 'INFO' | 'WARN' | 'ERROR';
  stage: 'PREPARING' | 'RENDERING' | 'FINALIZING' | 'COMPLETED' | 'CANCEL' | 'ERROR';
  message: string;
}

export interface CancelRenderResult {
  jobId: string;
  status: 'CANCEL_REQUESTED' | 'NOT_FOUND';
}

export interface RenderResult {
  jobId: string;
  status: 'COMPLETED';
  outputPath: string;
  outputBytes: number;
  elapsedMs: number;
  ffmpegPath: string;
  ffmpegVersion: string;
}

export const DEFAULT_EXPORT_VIDEO_SETTINGS: ExportVideoSettings = {
  codec: 'h264',
  crf: 20,
  preset: 'medium',
};

export const DEFAULT_EXPORT_AUDIO_SETTINGS: ExportAudioSettings = {
  mode: 'reduce',
  sourceGain: 0.25,
  dubbedGain: 1,
  codec: 'aac',
  bitrateKbps: 192,
};
