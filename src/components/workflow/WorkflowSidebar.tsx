import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { VOICE_OPTIONS } from '../../constants/voices';
import type {
  Language,
  PipelineProgressView,
  RecognizeMode,
  TranslationEnvironmentResult,
  TranslationProgress,
  TtsEnvironmentResult,
  TtsGenerationResult,
  UiText,
  Voice,
  VoiceEngineState,
  VoicePreviewResult,
} from '../../types';

type PipelineItem = { readonly key: string; readonly label: string; readonly state: 'ready' | 'skip' | 'run' | 'blocked'; readonly detail: string };

interface WorkflowSidebarProps {
  t: UiText;
  language: Language;
  sourceLanguage: 'zh' | 'ko';
  setSourceLanguage: Dispatch<SetStateAction<'zh' | 'ko'>>;
  videoInputRef: RefObject<HTMLInputElement | null>;
  handleVideoFile: (file: File | null) => void;
  videoFile: File | null;
  removeVideo: () => void;
  recognizeMode: RecognizeMode;
  setRecognizeMode: Dispatch<SetStateAction<RecognizeMode>>;
  dialogueInputRef: RefObject<HTMLInputElement | null>;
  dialogueFile: File | null;
  handleDialogueFile: (file: File | null) => void;
  translatedInputRef: RefObject<HTMLInputElement | null>;
  translatedFile: File | null;
  handleTranslatedFile: (file: File | null) => void;
  translationEnvironment: TranslationEnvironmentResult | null;
  translationRunning: boolean;
  translationProgress: TranslationProgress | null;
  handleStartTranslation: () => void;
  savedTranslationPath: string | null;
  handleOpenTranslationFolder: () => void;
  voice: Voice;
  setVoice: Dispatch<SetStateAction<Voice>>;
  speed: number;
  setSpeed: Dispatch<SetStateAction<number>>;
  pitch: number;
  setPitch: Dispatch<SetStateAction<number>>;
  voicePreview: VoicePreviewResult | null;
  voicePreviewLoading: boolean;
  voicePreviewError: string | null;
  pipelineSourceReady: boolean;
  ttsEnvironment: TtsEnvironmentResult | null;
  voiceEngineState: VoiceEngineState;
  refreshTtsEnvironment: () => Promise<TtsEnvironmentResult>;
  generationRunning: boolean;
  canGenerateVoice: boolean;
  handleGenerateVoice: () => void;
  ttsGeneration: TtsGenerationResult | null;
  backgroundAudioMode: 'reduce' | 'keep' | 'mute';
  setBackgroundAudioMode: Dispatch<SetStateAction<'reduce' | 'keep' | 'mute'>>;
  pipelineDone: boolean;
  pipelineRunning: boolean;
  pipeline: readonly PipelineItem[];
  startAutoPipeline: () => void;
  autoActionLabel: string;
  exportLog: () => void;
  openLogFolder: () => void | Promise<void>;
  clearLog: () => void | Promise<void>;
  renderLogs: string[];
  progressView: PipelineProgressView;
  addLog: (message: string, category?: string) => void;
}

export function WorkflowSidebar(props: WorkflowSidebarProps) {
  const {
    t, language, sourceLanguage, setSourceLanguage, videoInputRef, handleVideoFile, videoFile, removeVideo,
    recognizeMode, setRecognizeMode, dialogueInputRef, dialogueFile, handleDialogueFile,
    translatedInputRef, translatedFile, handleTranslatedFile, voice, setVoice,
    translationEnvironment, translationRunning, translationProgress, handleStartTranslation,
    savedTranslationPath, handleOpenTranslationFolder,
    speed, setSpeed, pitch, setPitch, voicePreview, voicePreviewLoading, voicePreviewError,
    pipelineSourceReady, ttsEnvironment, voiceEngineState,
    refreshTtsEnvironment, generationRunning, canGenerateVoice, handleGenerateVoice,
    ttsGeneration, backgroundAudioMode,
    setBackgroundAudioMode, pipelineDone, pipelineRunning, pipeline,
    startAutoPipeline, autoActionLabel, exportLog, openLogFolder, clearLog, renderLogs, progressView, addLog,
  } = props;
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [renderLogs]);

  return (
      <aside className="rdvd-sidebar">
        <section className="rdvd-card">
          <div className="rdvd-step"><b>1</b><h2>{t.importTitle}</h2><span>⌃</span></div>
          <input ref={videoInputRef} className="rdvd-hidden-file" type="file" accept="video/*" onChange={(e) => { handleVideoFile(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />
          <button className="rdvd-primary" onClick={() => videoInputRef.current?.click()}>▣ <span>{t.chooseMedia}</span></button>
          <div className="rdvd-path-label">{t.path}</div>
          <div className="rdvd-input-row"><input value={videoFile?.name ?? t.noVideo} readOnly /><button aria-label={language === 'vi' ? 'Xóa video' : 'Remove video'} disabled={!videoFile} onClick={removeVideo}>×</button></div>
          {videoFile && <div className="rdvd-file-info"><div className="rdvd-file-icon">MEDIA</div><div><strong>{videoFile.name}</strong><span>{t.fileLoaded} · {Math.round(videoFile.size / 1024 / 1024 * 10) / 10} MB</span></div></div>}
        </section>
    
        <section className="rdvd-card">
          <div className="rdvd-step"><b className="green">2</b><h2>{t.recognition}</h2><button className="rdvd-mini-btn">⚙ <span>{t.settings}</span></button></div>
          <div className="rdvd-radio-row">
            <label><input type="radio" checked={recognizeMode === 'voice'} onChange={() => setRecognizeMode('voice')} /><span><strong>{t.onlyVoice}</strong><small>{t.textOnly}</small></span></label>
            <label><input type="radio" checked={recognizeMode === 'subtitle'} onChange={() => setRecognizeMode('subtitle')} /><span><strong>{t.onlySubtitle}</strong><small>{t.srtVtt}</small></span></label>
            <label><input type="radio" checked={recognizeMode === 'both'} onChange={() => setRecognizeMode('both')} /><span><strong>{t.both}</strong><small>{t.andSubtitle}</small></span></label>
          </div>
          <button className="rdvd-action green-action">▶ <span>{t.startRecognition}</span></button>
        </section>
    
        <section className="rdvd-card">
          <div className="rdvd-step"><b className="orange">3</b><h2>{t.translation}</h2><span>⌃</span></div>
          <div className="rdvd-two-col">
            <div><label>{t.sourceLanguage}</label><select value={sourceLanguage} onChange={(e) => {
              const value = e.target.value as 'zh' | 'ko';
              setSourceLanguage(value);
              if (value === 'ko') {
                addLog('Đã chọn ngôn ngữ nguồn: Tiếng Hàn (한국어). Model dịch Hàn → Việt chưa được tích hợp, hệ thống đang chờ model.', 'TRANSLATION');
                addLog('KO-VI PIPELINE: WAITING_MODEL — Không sử dụng HachimiMT-60-QT.', 'MODEL');
              } else {
                addLog('Đã chọn ngôn ngữ nguồn: Tiếng Trung (简体中文). Sử dụng HachimiMT-60-QT.', 'TRANSLATION');
              }
            }}><option value="zh">🇨🇳 Tiếng Trung (简体中文)</option><option value="ko">🇰🇷 Tiếng Hàn (한국어) — Chờ model</option></select></div>
            <div><label>{t.targetLanguage}</label><select value="vi"><option value="vi">🇻🇳 Tiếng Việt</option></select></div>
          </div>
          <input ref={dialogueInputRef} className="rdvd-hidden-file" type="file" accept=".txt,.srt,.vtt,.json" onChange={(e) => handleDialogueFile(e.target.files?.[0] ?? null)} />
          <div className="rdvd-upload-row"><div className="upload-label">{t.dialogue}</div><input value={dialogueFile?.name ?? t.noFile} readOnly /><button className="rdvd-secondary" onClick={() => dialogueInputRef.current?.click()}>↥ <span>{t.upload}</span></button></div>
          <input ref={translatedInputRef} className="rdvd-hidden-file" type="file" accept=".srt,.vtt,.txt" onChange={(e) => handleTranslatedFile(e.target.files?.[0] ?? null)} />
          <div className="rdvd-upload-row"><div className="upload-label">{t.translatedUpload}</div><input value={translatedFile?.name ?? t.noFile} readOnly /><button className="rdvd-secondary" onClick={() => translatedInputRef.current?.click()}>↥ <span>{t.upload}</span></button></div>
          <div className="rdvd-translation-actions">
            <button
              className="rdvd-action orange-action"
              disabled={!dialogueFile || translationRunning}
              title={translationEnvironment?.message ?? ''}
              onClick={handleStartTranslation}
            >◌ <span>{translationRunning && translationProgress ? `${t.startTranslation} ${translationProgress.completed}/${translationProgress.total}` : t.startTranslation}</span></button>
            <button
              type="button"
              className="rdvd-secondary translation-folder-button"
              disabled={!savedTranslationPath}
              title={savedTranslationPath ?? t.openTranslationFolder}
              onClick={handleOpenTranslationFolder}
            >⌂ <span>{t.openTranslationFolder}</span></button>
          </div>
        </section>
    
        <section className="rdvd-card rdvd-card-render">
          <div className="rdvd-step"><b className="purple">4</b><h2>{t.dubbing}</h2><span>⌃</span></div>
          <div className="rdvd-form-field">
            <label>{t.selectActor}</label>
            <select className="rdvd-select-wide" value={voice} onChange={(e) => setVoice(e.target.value as Voice)}>
              {VOICE_OPTIONS.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </div>

          <div className="rdvd-voice-preview">
            <div className="rdvd-voice-preview-head">
              <strong>{t.voicePreview}</strong>
              <small title={voicePreview?.filePath ?? voicePreviewError ?? ''}>
                {voicePreviewLoading ? t.previewLoading : voicePreview ? voicePreview.voiceName : t.previewUnavailable}
              </small>
            </div>
            {voicePreview
              ? <audio key={voicePreview.filePath} controls preload="metadata" src={voicePreview.dataUrl} />
              : <div className={`rdvd-audio-placeholder${voicePreviewError ? ' error' : ''}`} title={voicePreviewError ?? ''}>{voicePreviewLoading ? '•••' : '♪'}</div>}
          </div>

          <div className="rdvd-range-grid">
            <label>
              <span>{t.speed} <output>{speed.toFixed(1)}</output></span>
              <input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(e) => setSpeed(Number(e.target.value))} />
            </label>
            <label>
              <span>{t.pitch} <output>{pitch}</output></span>
              <input type="range" min="-12" max="12" step="1" value={pitch} onChange={(e) => setPitch(Number(e.target.value))} />
            </label>
          </div>

          <button
            type="button"
            className={`rdvd-action purple-action rdvd-generate-voice${generationRunning ? ' running' : ''}`}
            disabled={!canGenerateVoice || generationRunning}
            onClick={handleGenerateVoice}
          >♪ <span>{generationRunning ? t.creatingRealVoice : t.createRealVoice}</span></button>
          {ttsGeneration && <div className="rdvd-generated-voice-status" title={ttsGeneration.outputPath}>✓ {t.generatedVoice} · {ttsGeneration.outputPath.split(/[\\/]/).pop()}</div>}
    
          <div className="rdvd-setting-grid compact-two">
            <label><span>{t.subtitles}</span><select><option>{t.burnInOn}</option><option>{t.off}</option></select></label>
            <label><span>{t.backgroundAudio}</span><select value={backgroundAudioMode} onChange={(event) => setBackgroundAudioMode(event.target.value as 'reduce' | 'keep' | 'mute')}><option value="reduce">{t.reduceBg}</option><option value="keep">{t.keepOriginal}</option><option value="mute">{t.muteBg}</option></select></label>
          </div>
          <div className={`rdvd-tts-engine ${voiceEngineState}`}>
            <span>{voiceEngineState === 'ready' ? '●' : voiceEngineState === 'checking' ? '◌' : '!'}</span>
            <div><strong>{voiceEngineState === 'ready' ? t.ttsReady : t.ttsMissing}</strong><small title={ttsEnvironment?.pythonPath ?? ''}>{ttsEnvironment?.message ?? ''}</small></div>
            {voiceEngineState !== 'ready' && <button type="button" onClick={() => { void refreshTtsEnvironment().catch(() => undefined); }}>{t.retryTts}</button>}
          </div>
          <div className="rdvd-pipeline-head"><div><strong>{t.pipeline}</strong><small>{t.autoDecision}</small></div><span className={`pipeline-state ${pipelineDone ? 'done' : pipelineRunning ? 'running' : videoFile && voiceEngineState === 'ready' && pipelineSourceReady ? 'ready' : 'blocked'}`}>{pipelineDone ? t.pipelineDone : pipelineRunning ? t.pipelineRunning : videoFile && voiceEngineState === 'ready' && pipelineSourceReady ? t.ready : t.renderBlocked}</span></div>
          <div className="rdvd-pipeline-list">{pipeline.map((step) => <div className={`pipeline-item ${step.state}`} key={step.key}><span className="pipeline-dot">{step.state === 'ready' ? '✓' : step.state === 'skip' ? '↷' : step.state === 'run' ? '▶' : '!'}</span><div><strong>{step.label}</strong><small>{step.detail}</small></div><em>{step.state === 'ready' ? t.ready : step.state === 'skip' ? t.skip : step.state === 'run' ? t.run : t.blocked}</em></div>)}</div>
          {!videoFile && <div className="rdvd-render-warning">⚠ {t.missingVideo}</div>}
          {videoFile && !pipelineSourceReady && <div className="rdvd-render-warning">⚠ {t.missingTtsSource}</div>}
          <button className={`rdvd-action purple-action render-action pipeline-main-button${pipelineRunning ? ' running' : ''}`} disabled={!videoFile || voiceEngineState !== 'ready' || !pipelineSourceReady || pipelineRunning} onClick={startAutoPipeline}><span>{autoActionLabel}</span></button>
        </section>
    
        <section className="rdvd-card rdvd-log-card">
          <div className="rdvd-step"><b className="pink">5</b><h2>{t.liveLog}</h2><div className="rdvd-log-actions"><button className="rdvd-mini-btn" onClick={exportLog}>⇩ <span>{t.exportLog}</span></button><button className="rdvd-mini-btn" onClick={openLogFolder}>⌂ <span>{t.openLogFolder}</span></button><button className="rdvd-mini-btn" onClick={clearLog}>⌫ <span>{t.clearLog}</span></button></div></div>
          <div className={`rdvd-work-progress ${progressView.active ? 'active' : ''} ${progressView.state}`} aria-label={`${progressView.label}: ${Math.round(progressView.percent)}%`}>
            <div className="rdvd-work-progress-meta"><span title={progressView.label}>{progressView.label}</span><strong>{progressView.active ? progressView.percent.toFixed(1) : Math.round(progressView.percent)}%</strong></div>
            <div className="rdvd-work-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressView.percent}>
              <div
                className="rdvd-work-progress-fill"
                style={{
                  width: `${progressView.percent}%`,
                  background: `linear-gradient(90deg, #24c977 0%, hsl(${Math.round(120 - progressView.percent * 1.2)} 88% 58%) 100%)`,
                }}
              />
            </div>
          </div>
          <div className="rdvd-log" ref={logRef}>{renderLogs.length === 0 ? <div className="log-empty">{t.logReady}</div> : renderLogs.map((line, index) => <div className={index === renderLogs.length - 1 ? 'active' : ''} key={`${line}-${index}`}>{line}</div>)}</div>
        </section>
      </aside>
  );
}
