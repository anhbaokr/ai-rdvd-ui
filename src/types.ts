export type Voice =
  | 'minh-duc'
  | 'pham-tuyen'
  | 'thai-son'
  | 'xuan-vinh'
  | 'thanh-binh'
  | 'truc-ly'
  | 'ngoc-linh'
  | 'doan-trang'
  | 'mai-anh'
  | 'thuc-doan'
  | 'minh-triet'
  | 'thuy-dung'
  | 'quang-son'
  | 'ngoc-tran'
  | 'my-duyen'
  | 'quynh-anh'
  | 'duc-tri'
  | 'kim-thanh'
  | 'ngoc-huyen'
  | 'adam'
  | 'manh-dung'
  | 'minh-quan'
  | 'anh-khoi';

export type RecognizeMode = 'voice' | 'subtitle' | 'both';
export type Language = 'vi' | 'en';
export type Theme = 'dark' | 'light';
export type SettingsTab = 'general' | 'playback' | 'appearance' | 'timeline' | 'shortcuts';
export type AutoStage = 'idle' | 'recognizing' | 'translating' | 'dubbing' | 'committing' | 'completed';
export type EditTab = 'edit' | 'export';
export type SubtitleSegment = { id?: string; start: number; end: number; text: string };

export interface TtsCue {
  segmentId: string;
  startMs: number;
  endMs: number;
  text: string;
}

export interface TtsCueResult extends TtsCue {
  actualStartMs: number;
  actualEndMs: number;
  durationSeconds: number;
}
export type SelectionHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

export interface BoxState {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DragSession {
  mode: 'move' | 'resize';
  handle?: SelectionHandle;
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startBox: BoxState;
  scaleX: number;
  scaleY: number;
  rafId: number | null;
  pendingEvent: PointerEvent | null;
  currentBox: BoxState;
}

export type UiText = (typeof import('./constants/uiText').UI_TEXT)[Language];

export type VoiceEngineState = 'checking' | 'ready' | 'missing' | 'error';

export interface VoicePreviewResult {
  dataUrl: string;
  filePath: string;
  voiceName: string;
}

export interface TtsEnvironmentResult {
  ready: boolean;
  pythonPath: string | null;
  workerPath: string | null;
  audioDirectory: string;
  outputDirectory: string;
  logFilePath: string;
  message: string;
  diagnostics: string[];
}

export interface TtsGenerationResult {
  outputPath: string;
  voiceName: string;
  durationSeconds: number;
  sampleRate: number;
  diagnostics: string[];
  aligned?: boolean;
  cues?: TtsCueResult[];
}

export interface TtsProgress {
  phase: 'engine' | 'synthesis' | 'writing' | 'completed' | string;
  completed: number;
  total: number;
  percent: number;
  message: string;
}

export interface PipelineProgressView {
  percent: number;
  label: string;
  active: boolean;
  state: 'idle' | 'running' | 'completed' | 'error';
}

export type TranslationStatus = 'PASS' | 'REVIEW' | 'FAIL';

export interface TranslationEnvironmentResult {
  ready: boolean;
  pythonPath: string | null;
  workerPath: string | null;
  assetsRoot: string;
  outputDirectory: string;
  logFilePath: string;
  message: string;
  diagnostics: string[];
}

export interface SavedTranslationFile {
  fileName: string;
  outputPath: string;
  outputDirectory: string;
}

export interface TranslationSegmentInput {
  segmentId: string;
  startMs: number;
  endMs: number;
  sourceText: string;
}

export interface TranslationFinding {
  severity: 'WARN' | 'ERROR' | string;
  kind: string;
  message: string;
}

export interface TranslationCandidateSummary {
  modelRank: number;
  modelScore: number;
  status: TranslationStatus;
  findingKinds: string[];
  selected: boolean;
}

export interface TranslationSelection {
  strategy: 'hachimi-nbest-terminology-guard-rerank' | string;
  candidateCount: number;
  selectedModelRank: number;
  selectedModelScore: number;
  terminologyCoverage: number;
  alternatives: TranslationCandidateSummary[];
}

export interface TranslationSegmentResult extends TranslationSegmentInput {
  targetText: string;
  status: TranslationStatus;
  findings: TranslationFinding[];
  terms: Array<Record<string, unknown>>;
  terminologyPlan: Array<Record<string, unknown>>;
  meaningFrame: Record<string, unknown>;
  translationSelection?: TranslationSelection;
  latencyMs: number;
  resumed: boolean;
}

export interface TranslationRunResult {
  schema: string;
  workerVersion: string;
  jobId: string;
  sourceDigest: string;
  sourceLanguage: 'zh';
  targetLanguage: 'vi';
  status: TranslationStatus;
  accepted: boolean;
  counts: Record<TranslationStatus, number>;
  segments: TranslationSegmentResult[];
  elapsedMs: number;
  model: string;
  checkpointPath: string;
}

export interface TranslationProgress {
  jobId: string;
  completed: number;
  total: number;
  segmentId: string;
  status: TranslationStatus;
}
