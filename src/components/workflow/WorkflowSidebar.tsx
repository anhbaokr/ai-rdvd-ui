import { useEffect, useRef, useState } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import { VOICE_OPTIONS } from '../../constants/voices';
import { PaymentCard } from '../../features/payment/components';
import { LicenseRenewalModal } from '../../features/payment/components/LicenseRenewalModal';
import type {
  Language,
  PipelineProgressView,
  RecognizeMode,
  RecognitionProgress,
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
  recognitionRunning: boolean;
  recognitionProgress: RecognitionProgress | null;
  recognitionResultCount: number;
  handleStartRecognition: () => void;
  handleChooseMedia: () => void;
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
  license: LicenseSummary | null;
  licenseRemainingMs: number;
  licenseDetailsOpen: boolean;
  onToggleLicenseDetails: () => void;
  onLicenseActivated?: () => void | Promise<void>;
}

type LicenseSummary = {
  package: string;
  package_name?: string;
  order_id: string;
  status: string;
  activated_at: string;
  expires_at: string;
  device_limit?: number;
};

const formatLicenseDate = (value: string, locale: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toLocaleString(locale);
};

const formatLicenseCountdown = (milliseconds: number, language: Language) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days} ${language === 'vi' ? 'ngày' : 'days'} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

export function WorkflowSidebar(props: WorkflowSidebarProps) {
  const {
    t, language, sourceLanguage, setSourceLanguage, videoInputRef, handleVideoFile, videoFile, removeVideo,
    recognizeMode, setRecognizeMode, recognitionRunning, recognitionProgress, recognitionResultCount, handleStartRecognition,
    handleChooseMedia, dialogueInputRef, dialogueFile, handleDialogueFile,
    translatedInputRef, translatedFile, handleTranslatedFile, voice, setVoice,
    translationEnvironment, translationRunning, translationProgress, handleStartTranslation,
    savedTranslationPath, handleOpenTranslationFolder,
    speed, setSpeed, pitch, setPitch, voicePreview, voicePreviewLoading, voicePreviewError,
    pipelineSourceReady, ttsEnvironment, voiceEngineState,
    refreshTtsEnvironment, generationRunning, canGenerateVoice, handleGenerateVoice,
    ttsGeneration, backgroundAudioMode,
    setBackgroundAudioMode, pipelineDone, pipelineRunning, pipeline,
    startAutoPipeline, autoActionLabel, exportLog, openLogFolder, clearLog, renderLogs, progressView, addLog, license, licenseRemainingMs, licenseDetailsOpen, onToggleLicenseDetails, onLicenseActivated,
  } = props;
  const [renewalModalOpen, setRenewalModalOpen] = useState(false);
  const logRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = logRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [renderLogs]);

  return (
      <aside className="rdvd-sidebar">
      <style>{`
        @keyframes rdvdLicenseAttention {
          0%, 100% {
            box-shadow: 0 0 0 0 rgba(46, 219, 139, 0.00), 0 0 0 rgba(46, 219, 139, 0.00);
          }
          50% {
            box-shadow: 0 0 0 2px rgba(46, 219, 139, 0.18), 0 0 18px rgba(46, 219, 139, 0.18);
          }
        }

        @keyframes rdvdLicenseAttentionButton {
          0%, 100% {
            transform: translateY(0);
            box-shadow: 0 0 0 rgba(72, 170, 255, 0.00);
          }
          50% {
            transform: translateY(-1px);
            box-shadow: 0 0 12px rgba(72, 170, 255, 0.28);
          }
        }

        .rdvd-license-card-attention {
          animation: rdvdLicenseAttention 2.8s ease-in-out infinite;
        }

        .rdvd-license-card-attention .rdvd-license-toggle {
          animation: rdvdLicenseAttentionButton 2.8s ease-in-out infinite;
        }

        @media (prefers-reduced-motion: reduce) {
          .rdvd-license-card-attention,
          .rdvd-license-card-attention .rdvd-license-toggle {
            animation: none;
          }
        }
      `}</style>
        {!license && <PaymentCard language={language} />}

        {license && (
          <section className={`rdvd-license-card${licenseDetailsOpen ? '' : ' rdvd-license-card-attention'}`} aria-label={language === 'vi' ? 'Bản quyền đang hoạt động' : 'License active'}>
            <div className="rdvd-license-card-head">
              <div className="rdvd-license-card-title">
                <span className="rdvd-license-status-icon" aria-hidden="true">✓</span>
                <div>
                  <strong>{language === 'vi' ? 'BẢN QUYỀN ĐANG HOẠT ĐỘNG' : 'LICENSE ACTIVE'}</strong>
                  <span>{language === 'vi' ? 'Được xác thực từ Payment Gateway' : 'Validated by Payment Gateway'}</span>
                </div>
              </div>
              <button
                type="button"
                className="rdvd-license-toggle"
                aria-expanded={licenseDetailsOpen}
                onClick={onToggleLicenseDetails}
              >
                {licenseDetailsOpen
                  ? (language === 'vi' ? 'Ẩn ▲' : 'Hide ▲')
                  : (language === 'vi' ? 'Hiện ▼' : 'Show ▼')}
              </button>
            </div>

            {licenseDetailsOpen && (
              <div className="rdvd-license-details">
                <div className="rdvd-license-grid">
                  <span className="rdvd-license-label label-blue">{language === 'vi' ? 'Gói' : 'Package'}</span>
                  <strong className="rdvd-license-value value-blue">{license.package_name || license.package}</strong>

                  <span className="rdvd-license-label label-purple">{language === 'vi' ? 'Đơn hàng' : 'Order ID'}</span>
                  <strong className="rdvd-license-value value-purple">{license.order_id}</strong>

                  <span className="rdvd-license-label label-green">{language === 'vi' ? 'Trạng thái' : 'Status'}</span>
                  <strong className="rdvd-license-value value-green">{license.status}</strong>

                  <span className="rdvd-license-label label-cyan">{language === 'vi' ? 'Kích hoạt' : 'Activated'}</span>
                  <strong className="rdvd-license-value value-cyan">{formatLicenseDate(license.activated_at, language === 'vi' ? 'vi-VN' : 'en-GB')}</strong>

                  <span className="rdvd-license-label label-orange">{language === 'vi' ? 'Hết hạn' : 'Expires'}</span>
                  <strong className="rdvd-license-value value-orange">{formatLicenseDate(license.expires_at, language === 'vi' ? 'vi-VN' : 'en-GB')}</strong>

                  <span className="rdvd-license-label label-green">{language === 'vi' ? 'Còn lại' : 'Remaining'}</span>
                  <strong className="rdvd-license-value value-countdown" aria-live="polite">
                    {formatLicenseCountdown(licenseRemainingMs, language)}
                  </strong>

                  <span className="rdvd-license-label label-blue">{language === 'vi' ? 'Thiết bị' : 'Device'}</span>
                  <strong className="rdvd-license-value value-blue">{`1 / ${license.device_limit ?? '—'}`}</strong>
                </div>
              </div>
            )}

            <button
              type="button"
              className="rdvd-action blue-action"
              style={{ width: '100%', marginTop: 9 }}
              onClick={() => setRenewalModalOpen(true)}
            >
              {language === 'vi' ? 'KÍCH HOẠT / GIA HẠN BẢN QUYỀN' : 'ACTIVATE / RENEW LICENSE'}
            </button>
          </section>
        )}

        {renewalModalOpen && license && (
          <LicenseRenewalModal
            language={language}
            currentLicense={license}
            onClose={() => setRenewalModalOpen(false)}
            onActivated={onLicenseActivated}
          />
        )}

        <section className="rdvd-card">
          <div className="rdvd-step"><b>1</b><h2>{t.importTitle}</h2><span>⌃</span></div>
          <input ref={videoInputRef} className="rdvd-hidden-file" type="file" accept="video/*" onChange={(e) => { handleVideoFile(e.target.files?.[0] ?? null); e.currentTarget.value = ''; }} />
          <button className="rdvd-primary" onClick={handleChooseMedia}>▣ <span>{t.chooseMedia}</span></button>
          <div className="rdvd-path-label">{t.path}</div>
          <div className="rdvd-input-row"><input value={videoFile?.name ?? t.noVideo} readOnly /><button aria-label={language === 'vi' ? 'Xóa video' : 'Remove video'} disabled={!videoFile} onClick={removeVideo}>×</button></div>
          {videoFile && <div className="rdvd-file-info"><div className="rdvd-file-icon">MEDIA</div><div><strong>{videoFile.name}</strong><span>{t.fileLoaded}{videoFile.size > 0 ? ` · ${Math.round(videoFile.size / 1024 / 1024 * 10) / 10} MB` : ''}</span></div></div>}
        </section>
    
        <section className="rdvd-card">
          <div className="rdvd-step"><b className="green">2</b><h2>{t.recognition}</h2><button className="rdvd-mini-btn">⚙ <span>{t.settings}</span></button></div>
          <div className="rdvd-two-col">
            <div><label>{t.recognitionSourceLanguage}</label><select value={sourceLanguage} onChange={(e) => setSourceLanguage(e.target.value as 'zh' | 'ko')} disabled={recognitionRunning}>
              <option value="zh">🇨🇳 {t.recognitionSourceChinese}</option>
              <option value="ko">🇰🇷 {t.recognitionSourceKorean}</option>
            </select></div>
          </div>
          <div className="rdvd-radio-row">
            <label className={recognizeMode === 'voice' ? 'disabled' : ''}><input type="radio" disabled checked={recognizeMode === 'voice'} onChange={() => setRecognizeMode('voice')} /><span><strong>{t.onlyVoice}</strong><small>{t.textOnly}</small></span></label>
            <label><input type="radio" disabled={recognitionRunning} checked={recognizeMode === 'subtitle'} onChange={() => setRecognizeMode('subtitle')} /><span><strong>{t.onlySubtitle}</strong><small>{t.srtVtt}</small></span></label>
            <label><input type="radio" disabled={recognitionRunning} checked={recognizeMode === 'both'} onChange={() => setRecognizeMode('both')} /><span><strong>{t.both}</strong><small>{t.andSubtitle}</small></span></label>
          </div>
          {sourceLanguage === 'ko'
            ? <div className="rdvd-render-warning">⚠ {t.recognitionKoreanPending}</div>
            : recognizeMode === 'voice'
              ? <div className="rdvd-render-warning">⚠ {t.recognitionAsrPending}</div>
              : <div className="rdvd-render-warning">ℹ {t.recognitionSubtitleReady}{recognizeMode === 'both' ? ` · ${t.recognitionAsrPending}` : ''}</div>}
          {recognitionProgress && <div className={`rdvd-work-progress ${recognitionRunning ? 'active' : ''}`}>
            <div className="rdvd-work-progress-meta"><span title={recognitionProgress.message}>{t.recognitionProgress}</span><strong>{recognitionProgress.percent.toFixed(1)}%</strong></div>
            <div className="rdvd-work-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={recognitionProgress.percent}>
              <div className="rdvd-work-progress-fill" style={{ width: `${recognitionProgress.percent}%` }} />
            </div>
          </div>}
          {!recognitionRunning && recognitionResultCount > 0 && <div className="rdvd-render-warning">✓ {recognitionResultCount} {t.recognitionSegments}</div>}
          <button
            className={`rdvd-action green-action${recognitionRunning ? ' running' : ''}`}
            disabled={!videoFile || !videoFile.name || sourceLanguage === 'ko' || recognizeMode === 'voice' || recognitionRunning}
            onClick={handleStartRecognition}
          >▶ <span>{recognitionRunning && recognitionProgress ? `${t.startRecognition} ${recognitionProgress.percent.toFixed(0)}%` : t.startRecognition}</span></button>
        </section>
    
        <section className="rdvd-card">
          <div className="rdvd-step"><b className="orange">3</b><h2>{t.translation}</h2><span>⌃</span></div>
          <div className="rdvd-two-col rdvd-translation-language-row">
            <div className="rdvd-translation-language-field" style={{ minWidth: 0 }}>
              <label>{t.sourceLanguage}</label>
              <select
                value={sourceLanguage}
                onChange={(e) => setSourceLanguage(e.target.value as 'zh' | 'ko')}
                disabled={recognitionRunning || translationRunning}
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
              >
                <option value="zh">🇨🇳 {t.recognitionSourceChinese}</option>
                <option value="ko">🇰🇷 {t.recognitionSourceKorean}</option>
              </select>
            </div>
            <div className="rdvd-translation-language-field" style={{ minWidth: 0 }}>
              <label>{t.targetLanguage}</label>
              <select value="vi" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} onChange={() => undefined}>
                <option value="vi">🇻🇳 Tiếng Việt</option>
              </select>
            </div>
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
          <button
            className={`rdvd-action purple-action render-action pipeline-main-button${pipelineRunning || recognitionRunning || translationRunning || generationRunning ? ' running' : ''}`}
            disabled={!videoFile || voiceEngineState !== 'ready' || pipelineRunning || recognitionRunning || translationRunning || generationRunning}
            onClick={startAutoPipeline}
          >
            <span>{autoActionLabel}</span>
          </button>
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
