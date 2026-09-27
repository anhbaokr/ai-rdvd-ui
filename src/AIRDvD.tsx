import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import './styles/index.css';
import { UI_TEXT } from './constants/uiText';
import { CURSOR_BY_HANDLE, MIN_H, MIN_W, STAGE_H, STAGE_W } from './constants/editor';
import { DEFAULT_VOICE } from './constants/voices';
import type { BoxState, DragSession, Language, PipelineProgressView, RecognizeMode, SelectionHandle, SettingsTab, Theme, Voice } from './types';
import { usePipeline } from './hooks/usePipeline';
import { useMediaProject } from './hooks/useMediaProject';
import { useTimeline } from './hooks/useTimeline';
import { useVoiceEngine } from './hooks/useVoiceEngine';
import { useTranslationEngine } from './hooks/useTranslationEngine';
import { useAppLog } from './hooks/useAppLog';
import { Topbar } from './components/topbar/Topbar';
import { SettingsDialog } from './components/settings/SettingsDialog';
import { Timeline } from './components/timeline/Timeline';
import { WorkflowSidebar } from './components/workflow/WorkflowSidebar';
import { VideoPreview } from './components/preview/VideoPreview';
import { EditPanel } from './components/editor/EditPanel';
import { buildSubtitleDisplayCues } from './utils/subtitleDisplay';

export default function AIRDvD() {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem('ai-rdvd-language') as Language) || 'vi');
  const [sourceLanguage, setSourceLanguage] = useState<'zh' | 'ko'>('zh');
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('ai-rdvd-theme') as Theme) || 'dark');
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 238 });
  const languageButtonRef = useRef<HTMLButtonElement | null>(null);
  const themeButtonRef = useRef<HTMLButtonElement | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [globalShortcutsEnabled, setGlobalShortcutsEnabled] = useState(() => localStorage.getItem('ai-rdvd-shortcuts') !== 'off');
  const [playbackSeekStep, setPlaybackSeekStep] = useState(() => Number(localStorage.getItem('ai-rdvd-seek-step') || '5'));
  const [loopPlayback, setLoopPlayback] = useState(() => localStorage.getItem('ai-rdvd-loop') === 'on');
  const [startMuted, setStartMuted] = useState(() => localStorage.getItem('ai-rdvd-start-muted') === 'on');
  const [defaultTimelineZoom, setDefaultTimelineZoom] = useState(() => Number(localStorage.getItem('ai-rdvd-default-zoom') || '1'));
  const [autoSubtitleFrame, setAutoSubtitleFrame] = useState(() => localStorage.getItem('ai-rdvd-auto-subtitle-frame') !== 'off');
  const [subtitlePanelStartup, setSubtitlePanelStartup] = useState(() => localStorage.getItem('ai-rdvd-subtitle-panel-startup') === 'on');
  const [reduceMotion, setReduceMotion] = useState(() => localStorage.getItem('ai-rdvd-reduce-motion') === 'on');
  const t = UI_TEXT[language];
  const {
    renderLogs, addLog, clearLog, exportLog, openLogFolder,
  } = useAppLog(t.logReady);

  useEffect(() => { localStorage.setItem('ai-rdvd-language', language); }, [language]);
  useEffect(() => { localStorage.setItem('ai-rdvd-theme', theme); }, [theme]);
  useEffect(() => { localStorage.setItem('ai-rdvd-shortcuts', globalShortcutsEnabled ? 'on' : 'off'); }, [globalShortcutsEnabled]);
  useEffect(() => { localStorage.setItem('ai-rdvd-seek-step', String(playbackSeekStep)); }, [playbackSeekStep]);
  useEffect(() => { localStorage.setItem('ai-rdvd-loop', loopPlayback ? 'on' : 'off'); }, [loopPlayback]);
  useEffect(() => { localStorage.setItem('ai-rdvd-start-muted', startMuted ? 'on' : 'off'); }, [startMuted]);
  useEffect(() => { localStorage.setItem('ai-rdvd-default-zoom', String(defaultTimelineZoom)); }, [defaultTimelineZoom]);
  useEffect(() => { localStorage.setItem('ai-rdvd-auto-subtitle-frame', autoSubtitleFrame ? 'on' : 'off'); }, [autoSubtitleFrame]);
  useEffect(() => { localStorage.setItem('ai-rdvd-subtitle-panel-startup', subtitlePanelStartup ? 'on' : 'off'); }, [subtitlePanelStartup]);
  useEffect(() => { localStorage.setItem('ai-rdvd-reduce-motion', reduceMotion ? 'on' : 'off'); }, [reduceMotion]);
  useEffect(() => { setTimelineZoom(defaultTimelineZoom); }, [defaultTimelineZoom]);

  const positionTopbarMenu = useCallback((button: HTMLButtonElement | null) => {
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = 238;
    const left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right - width));
    const top = Math.min(window.innerHeight - 8, rect.bottom + 8);
    setMenuPosition({ top, left, width });
  }, []);

  useEffect(() => {
    const activeButton = showLanguageMenu ? languageButtonRef.current : showThemeMenu ? themeButtonRef.current : null;
    if (!activeButton) return;
    const reposition = () => positionTopbarMenu(activeButton);
    reposition();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [showLanguageMenu, showThemeMenu, positionTopbarMenu]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && showSettings) {
        event.preventDefault();
        setShowSettings(false);
        return;
      }
      if (!globalShortcutsEnabled) return;
      const target = event.target as HTMLElement | null;
      const isTypingTarget = !!target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      );
      if (isTypingTarget || !event.ctrlKey || !event.shiftKey) return;

      const key = event.key.toLowerCase();
      if (key === 'l') {
        event.preventDefault();
        setLanguage((current) => current === 'vi' ? 'en' : 'vi');
        setShowLanguageMenu(false);
        setShowThemeMenu(false);
      } else if (key === 't') {
        event.preventDefault();
        setTheme((current) => current === 'dark' ? 'light' : 'dark');
        setShowLanguageMenu(false);
        setShowThemeMenu(false);
      } else if (key === 's') {
        event.preventDefault();
        setShowSubtitlePanel((current) => !current);
        setShowLanguageMenu(false);
        setShowThemeMenu(false);
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.rdvd-topbar-menu')) {
        setShowLanguageMenu(false);
        setShowThemeMenu(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [globalShortcutsEnabled, showSettings]);

  const [recognizeMode, setRecognizeMode] = useState<RecognizeMode>('both');
  const [subtitleVisible, setSubtitleVisible] = useState(true);
  const [subtitleFrameVisible, setSubtitleFrameVisible] = useState(false);
  const [isPointerOverPlayer, setIsPointerOverPlayer] = useState(false);
  const [voice, setVoice] = useState<Voice>(DEFAULT_VOICE);
  const [speed, setSpeed] = useState(1);
  const [pitch, setPitch] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [backgroundAudioMode, setBackgroundAudioMode] = useState<'reduce' | 'keep' | 'mute'>('reduce');
  const [showSubtitlePanel, setShowSubtitlePanel] = useState(true);
  const [subtitleSize, setSubtitleSize] = useState(40);
  const [subtitleColor, setSubtitleColor] = useState('#FFFFFF');
  const [subtitleBg, setSubtitleBg] = useState('#363032');
  const [subtitleOpacity, setSubtitleOpacity] = useState(1);
  const [subtitleOutline, setSubtitleOutline] = useState(true);
  const [subtitleOutlineWidth, setSubtitleOutlineWidth] = useState(4);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoBox, setLogoBox] = useState<BoxState>({ x: 1680, y: 150, w: 190, h: 110 });
  const [logoDragging, setLogoDragging] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const logoDragRef = useRef<{ mode: 'move' | 'resize'; handle?: SelectionHandle; pointerId: number; startClientX: number; startClientY: number; startBox: BoxState; scaleX: number; scaleY: number } | null>(null);
  const logoElementRef = useRef<HTMLDivElement>(null);
  const logoBoxRef = useRef<BoxState>({ x: 1680, y: 150, w: 190, h: 110 });
  const [box, setBox] = useState<BoxState>({ x: 964.21, y: 877.69, w: 960, h: 52 });
  const [dragging, setDragging] = useState(false);
  const [dragPreview, setDragPreview] = useState<BoxState | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);

  const {
    videoFile, setVideoFile, videoUrl, setVideoUrl, isVideoPlaying, setIsVideoPlaying,
    videoCurrentTime, setVideoCurrentTime, videoDuration, setVideoDuration,
    videoThumbnails, setVideoThumbnails, audioWaveform, setAudioWaveform,
    dialogueFile, setDialogueFile, translatedFile, setTranslatedFile,
    subtitleSegments, setSubtitleSegments, videoInputRef, videoRef,
    dialogueInputRef, translatedInputRef,
  } = useMediaProject();
  const [translationAccepted, setTranslationAccepted] = useState(false);
  const hasDialogue = Boolean(dialogueFile || translatedFile);

  const {
    environment: translationEnvironment,
    ready: translationEngineReady,
    running: translationRunning,
    progress: translationProgress,
    savedFile: savedTranslationFile,
    translateDialogue,
    openOutputDirectory: openTranslationOutputDirectory,
  } = useTranslationEngine({
    dialogueFile,
    videoDuration,
    language,
    sourceLanguage,
    setTranslatedFile,
    setSubtitleSegments,
    setTranslationAccepted,
    addLog,
  });

  const {
    ttsText,
    preview: voicePreview, previewLoading: voicePreviewLoading, previewError: voicePreviewError,
    environment: ttsEnvironment, engineState: voiceEngineState,
    refreshEnvironment: refreshTtsEnvironment, generation: ttsGeneration,
    generationRunning, progress: ttsProgress, generateSpeech,
  } = useVoiceEngine({
    voice, speed, pitch, dialogueFile, translatedFile, translationAccepted, language, subtitleSegments, addLog,
  });

  const {
    timelineZoom, setTimelineZoom, timelineMarkers, setTimelineMarkers,
    timelineMuted, setTimelineMuted, videoTrackVisible, setVideoTrackVisible,
    videoTrackLocked, setVideoTrackLocked, videoTrackSync, setVideoTrackSync,
    audioTrackLocked, setAudioTrackLocked, audioTrackSolo, setAudioTrackSolo,
    audioTrackSync, setAudioTrackSync, dubbedTrackLocked, setDubbedTrackLocked,
    dubbedTrackSolo, setDubbedTrackSolo, dubbedTrackMuted, setDubbedTrackMuted,
    dubbedTrackSync, setDubbedTrackSync,
    subtitleTrackVisible, setSubtitleTrackVisible, subtitleTrackLocked, setSubtitleTrackLocked,
    timelineScrubbing, setTimelineScrubbing, timelineContextMenu, setTimelineContextMenu,
    timelineScrollRef,
  } = useTimeline();

  const {
    pipelineRunning, pipelineDone, setPipelineDone, autoStage, setAutoStage, editTab, setEditTab,
    exportQueued, setExportQueued, pipeline, autoActionLabel,
    startAutoPipeline, handleFinalExport,
  } = usePipeline({
    videoFile,
    dialogueFile,
    translatedFile,
    translationAccepted,
    translationAvailable: translationEngineReady,
    translateDialogue,
    t,
    generateSpeech,
    ttsEngineAvailable: voiceEngineState === 'ready',
    subtitleSegments,
    addLog,
    sourceLanguage,
  });

  const dubbedAudioRef = useRef<HTMLAudioElement>(null);
  const dubbedAudioUrl = useMemo(
    () => ttsGeneration ? convertFileSrc(ttsGeneration.outputPath) : null,
    [ttsGeneration],
  );

  const pipelineProgressTarget = useMemo<PipelineProgressView>(() => {
    const translationRatio = translationProgress?.total
      ? Math.max(0, Math.min(1, translationProgress.completed / translationProgress.total))
      : 0;
    const ttsRatio = Math.max(0, Math.min(1, (ttsProgress?.percent ?? 0) / 100));
    const vi = language === 'vi';

    if (pipelineRunning) {
      if (autoStage === 'recognizing') return { percent: 8, label: vi ? 'Đang nhận diện lời thoại' : 'Recognizing dialogue', active: true, state: 'running' };
      if (autoStage === 'translating') return {
        percent: Math.round(10 + translationRatio * 35),
        label: translationProgress?.total
          ? `${vi ? 'Đang dịch' : 'Translating'} ${translationProgress.completed}/${translationProgress.total}`
          : (vi ? 'Đang chuẩn bị dịch' : 'Preparing translation'),
        active: true,
        state: 'running',
      };
      if (autoStage === 'dubbing') return {
        percent: Math.round(45 + ttsRatio * 47),
        label: ttsProgress?.message || (vi ? 'Đang tạo giọng lồng tiếng' : 'Generating dubbed voice'),
        active: true,
        state: 'running',
      };
      if (autoStage === 'committing') return { percent: 97, label: vi ? 'Đang đưa kết quả xuống Timeline' : 'Committing results to Timeline', active: true, state: 'running' };
      if (autoStage === 'completed') return { percent: 100, label: vi ? 'Pipeline đã hoàn tất' : 'Pipeline completed', active: false, state: 'completed' };
      return { percent: 2, label: vi ? 'Đang khởi động pipeline' : 'Starting pipeline', active: true, state: 'running' };
    }
    if (translationRunning) return {
      percent: Math.round(translationRatio * 100),
      label: translationProgress?.total
        ? `${vi ? 'Đang dịch' : 'Translating'} ${translationProgress.completed}/${translationProgress.total}`
        : (vi ? 'Đang chuẩn bị dịch' : 'Preparing translation'),
      active: true,
      state: 'running',
    };
    if (generationRunning) return {
      percent: Math.round(ttsRatio * 100),
      label: ttsProgress?.message || (vi ? 'Đang tạo giọng lồng tiếng' : 'Generating dubbed voice'),
      active: true,
      state: 'running',
    };
    if (pipelineDone) return { percent: 100, label: vi ? 'Sẵn sàng chỉnh sửa và render' : 'Ready to edit and render', active: false, state: 'completed' };
    if (ttsProgress?.percent === 100) return { percent: 100, label: vi ? 'Đã tạo WAV lồng tiếng' : 'Dubbed WAV created', active: false, state: 'completed' };
    if (translationProgress?.total && translationProgress.completed >= translationProgress.total) return { percent: 100, label: vi ? 'Dịch đã hoàn tất' : 'Translation completed', active: false, state: 'completed' };
    return { percent: 0, label: vi ? 'Sẵn sàng' : 'Ready', active: false, state: 'idle' };
  }, [autoStage, generationRunning, language, pipelineDone, pipelineRunning, translationProgress, translationRunning, ttsProgress]);

  const [displayedProgress, setDisplayedProgress] = useState(0);
  const progressWasActiveRef = useRef(false);

  useEffect(() => {
    if (!pipelineProgressTarget.active) {
      progressWasActiveRef.current = false;
      setDisplayedProgress(pipelineProgressTarget.percent);
      return;
    }

    if (!progressWasActiveRef.current) {
      progressWasActiveRef.current = true;
      setDisplayedProgress(Math.min(2, pipelineProgressTarget.percent));
    }

    const timer = window.setInterval(() => {
      setDisplayedProgress((current) => {
        const realTarget = pipelineProgressTarget.percent;
        let ceiling = 96;
        if (pipelineRunning) {
          if (autoStage === 'recognizing') ceiling = 9;
          else if (autoStage === 'translating') {
            const segmentStep = translationProgress?.total ? 35 / translationProgress.total : 35;
            ceiling = Math.min(44.5, realTarget + segmentStep * 0.85);
          } else if (autoStage === 'dubbing') ceiling = 91.5;
          else if (autoStage === 'committing') ceiling = 99;
        } else if (translationRunning) {
          const segmentStep = translationProgress?.total ? 100 / translationProgress.total : 100;
          ceiling = Math.min(99, realTarget + segmentStep * 0.85);
        }

        const destination = Math.max(realTarget, ceiling);
        if (current >= destination) return current;
        const gap = destination - current;
        const increment = Math.max(0.08, Math.min(0.45, gap * 0.012));
        return Math.min(destination, current + increment);
      });
    }, 250);

    return () => window.clearInterval(timer);
  }, [autoStage, pipelineProgressTarget, pipelineRunning, translationProgress?.total, translationRunning]);

  const pipelineProgressView = useMemo<PipelineProgressView>(() => ({
    ...pipelineProgressTarget,
    percent: pipelineProgressTarget.active
      ? Math.max(0, Math.min(99, displayedProgress))
      : pipelineProgressTarget.percent,
  }), [displayedProgress, pipelineProgressTarget]);

  const subtitleDisplayCues = useMemo(
    () => buildSubtitleDisplayCues(subtitleSegments),
    [subtitleSegments],
  );
  const activeDisplayCue = useMemo(
    () => subtitleDisplayCues.find((item) => videoCurrentTime >= item.start && videoCurrentTime < item.end) ?? null,
    [subtitleDisplayCues, videoCurrentTime],
  );
  const activeSubtitleIndex = activeDisplayCue?.sourceIndex ?? -1;
  const activeSubtitleText = activeDisplayCue?.text ?? '';
  const currentTtsCues = useMemo(() => subtitleSegments
    .filter((segment) => segment.text.trim() && segment.end > segment.start)
    .map((segment, index) => ({
      segmentId: segment.id ?? `seg-${String(index + 1).padStart(6, '0')}`,
      startMs: Math.round(segment.start * 1000),
      endMs: Math.round(segment.end * 1000),
      text: segment.text.trim(),
    })), [subtitleSegments]);

  useEffect(() => {
    setPipelineDone(false);
    setAutoStage('idle');
    setExportQueued(false);
  }, [voice, speed, pitch, ttsText, setPipelineDone, setAutoStage, setExportQueued]);

  const handleVideoFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      window.alert(t.invalidVideo);
      return;
    }
    setVideoFile(file);
    setPipelineDone(false);
    setAutoStage('idle');
    setExportQueued(false);
    setIsVideoPlaying(false);
    setSubtitleSegments([]);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setSubtitleVisible(true);
    setSubtitleFrameVisible(autoSubtitleFrame);
    setIsMuted(startMuted);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    const objectUrl = URL.createObjectURL(file);
    setVideoUrl(objectUrl);
  }, [t.invalidVideo, videoUrl, autoSubtitleFrame, startMuted]);

  const handleLogoFile = useCallback((file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      window.alert(language === 'vi' ? 'Vui lòng chọn file hình ảnh.' : 'Please choose an image file.');
      return;
    }
    if (logoUrl) URL.revokeObjectURL(logoUrl);
    const url = URL.createObjectURL(file);
    setLogoFile(file);
    setLogoUrl(url);
    const image = new Image();
    image.onload = () => {
      const ratio = image.naturalWidth > 0 && image.naturalHeight > 0 ? image.naturalWidth / image.naturalHeight : 16 / 9;
      const w = 210;
      const h = Math.max(70, Math.min(180, w / ratio));
      const next = { x: STAGE_W - w / 2 - 55, y: h / 2 + 45, w, h };
      logoBoxRef.current = next;
      setLogoBox(next);
      URL.revokeObjectURL(image.src);
    };
    image.src = URL.createObjectURL(file);
  }, [language, logoUrl]);

  const removeLogo = useCallback(() => {
    setLogoFile(null);
    setLogoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (logoInputRef.current) logoInputRef.current.value = '';
  }, []);

  const handleDialogueFile = useCallback((file: File | null) => {
    if (!file) return;
    setDialogueFile(file); setTranslatedFile(null); setTranslationAccepted(false); setSubtitleSegments([]);
    setPipelineDone(false); setAutoStage('idle'); setExportQueued(false); addLog(`${language === 'vi' ? 'Đã nạp lời thoại' : 'Dialogue loaded'}: ${file.name}`);
  }, [addLog, language, setAutoStage, setExportQueued, setPipelineDone, setSubtitleSegments, setTranslatedFile]);

  const handleTranslatedFile = useCallback((file: File | null) => {
    if (!file) return;
    setTranslatedFile(file); setTranslationAccepted(true); setPipelineDone(false); setAutoStage('idle'); setExportQueued(false);
    addLog(`${language === 'vi' ? 'Đã nạp phụ đề dịch' : 'Translated subtitles loaded'}: ${file.name}`);
  }, [addLog, language, setAutoStage, setExportQueued, setPipelineDone, setTranslatedFile]);

  const handleStartTranslation = useCallback(() => {
    void translateDialogue().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Không thể hoàn tất bước dịch: ${message}`, 'ERROR');
    });
  }, [addLog, translateDialogue]);

  const handleOpenTranslationFolder = useCallback(() => {
    void openTranslationOutputDirectory().catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Không mở được thư mục bản dịch: ${message}`, 'ERROR');
    });
  }, [addLog, openTranslationOutputDirectory]);

  const handleGenerateVoice = useCallback(() => {
    void generateSpeech(undefined, undefined, currentTtsCues.length ? currentTtsCues : undefined).then((result) => {
      addLog(`Đã gắn WAV vào track A2: ${result.outputPath}`, 'TTS');
      if (videoFile && subtitleSegments.length > 0) {
        setAutoStage('completed');
        setPipelineDone(true);
        setExportQueued(false);
        setEditTab('edit');
        addLog('Video nguồn, phụ đề S1 và giọng lồng tiếng A2 đã nối; dự án sẵn sàng render.', 'PIPELINE');
      } else {
        addLog('WAV đã gắn A2; cần video nguồn và phụ đề S1 để chuyển dự án sang trạng thái render.', 'PIPELINE');
      }
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      addLog(`Không thể tạo và gắn giọng đọc: ${message}`, 'ERROR');
    });
  }, [addLog, currentTtsCues, generateSpeech, setAutoStage, setEditTab, setExportQueued, setPipelineDone, subtitleSegments.length, videoFile]);

  const removeVideo = useCallback(() => {
    setVideoFile(null);
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setSubtitleFrameVisible(false);
    setIsVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setVideoThumbnails([]);
    setAudioWaveform([]);
    setSubtitleSegments([]);
    setPipelineDone(false);
    setAutoStage('idle');
    setExportQueued(false);
    if (videoRef.current) videoRef.current.load();
    addLog(language === 'vi' ? 'Đã bỏ video nguồn.' : 'Source video removed.');
  }, [addLog, language, setAutoStage, setExportQueued, setPipelineDone, videoRef, videoUrl]);

  const seekVideo = useCallback((time: number) => {
    const next = Math.max(0, Math.min(videoDuration || 0, time));
    if (videoRef.current && videoDuration) videoRef.current.currentTime = next;
    setVideoCurrentTime(next);
  }, [videoDuration]);

  const requestSceneFullscreen = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen();
      return;
    }
    if (scene.requestFullscreen) void scene.requestFullscreen();
  }, []);

  const seekFromTimelinePointer = useCallback((event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => {
    if (!videoFile || !videoDuration) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    seekVideo(ratio * videoDuration);
  }, [seekVideo, videoFile, videoDuration]);

  const projectTimelineDuration = useMemo(() => {
    if (videoDuration > 0) return videoDuration;
    return subtitleSegments.reduce((maximum, segment) => Math.max(maximum, segment.end), 0);
  }, [subtitleSegments, videoDuration]);

  // One canonical timeline time-space: the ruler and media use the same pixels-per-second.
  // Zoom changes visible timeline density; it must never change the underlying video time.
  const timelineRulerDuration = useMemo(() => {
    const duration = projectTimelineDuration || 120;
    // Keep one technical time-space across the ruler, media, playhead and scrub.
    // Zoom-out (< 100%) shows additional empty time to the right so the real clip
    // still occupies exactly its zoomed proportion of the viewport. Zoom-in (>= 100%)
    // enlarges the canvas itself, so the ruler remains the video's real duration.
    return timelineZoom < 1 ? duration / Math.max(0.05, timelineZoom) : duration;
  }, [projectTimelineDuration, timelineZoom]);

  const seekFromTimelineRulerPointer = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!videoFile || !videoDuration) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    seekVideo(Math.min(videoDuration, ratio * timelineRulerDuration));
  }, [seekVideo, videoFile, videoDuration, timelineRulerDuration]);

  const startTimelineScrub = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (!videoFile || !videoDuration) return;
    event.preventDefault();
    seekFromTimelinePointer(event);
    setTimelineScrubbing(true);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
  }, [seekFromTimelinePointer, videoFile, videoDuration]);

  const moveTimelineScrub = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!timelineScrubbing) return;
    seekFromTimelinePointer(event);
  }, [seekFromTimelinePointer, timelineScrubbing]);

  const endTimelineScrub = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (!timelineScrubbing) return;
    try { event.currentTarget.releasePointerCapture(event.pointerId); } catch { /* best effort */ }
    setTimelineScrubbing(false);
  }, [timelineScrubbing]);

  const openTimelineMenu = useCallback((event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!videoFile || !videoDuration) return;
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
    setTimelineContextMenu({ x: event.clientX, y: event.clientY, time: ratio * videoDuration });
  }, [videoFile, videoDuration]);

  useEffect(() => {
    const close = () => setTimelineContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('resize', close); };
  }, []);

  useEffect(() => {
    const onTimelineKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.rdvd-timeline')) return;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable) return;
      if (event.code === 'Space') { event.preventDefault(); const player = videoRef.current; if (player) player.paused ? void player.play() : player.pause(); }
      else if (event.key === 'ArrowLeft') { event.preventDefault(); seekVideo(videoCurrentTime - (event.shiftKey ? 1 : playbackSeekStep)); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); seekVideo(videoCurrentTime + (event.shiftKey ? 1 : playbackSeekStep)); }
      else if (event.key === 'Home') { event.preventDefault(); seekVideo(0); }
      else if (event.key === 'End') { event.preventDefault(); seekVideo(videoDuration); }
    };
    window.addEventListener('keydown', onTimelineKey);
    return () => window.removeEventListener('keydown', onTimelineKey);
  }, [seekVideo, videoCurrentTime, videoDuration, playbackSeekStep]);

  const clampBox = useCallback((value: BoxState): BoxState => {
    const w = Math.min(STAGE_W, Math.max(MIN_W, value.w));
    const h = Math.min(STAGE_H, Math.max(MIN_H, value.h));
    const x = Math.max(w / 2, Math.min(STAGE_W - w / 2, value.x));
    const y = Math.max(h / 2, Math.min(STAGE_H - h / 2, value.y));
    return { x, y, w, h };
  }, []);

  const resizeBox = useCallback((start: BoxState, handle: SelectionHandle, dx: number, dy: number): BoxState => {
    let left = start.x - start.w / 2;
    let right = start.x + start.w / 2;
    let top = start.y - start.h / 2;
    let bottom = start.y + start.h / 2;

    if (handle.includes('w')) left += dx;
    if (handle.includes('e')) right += dx;
    if (handle.includes('n')) top += dy;
    if (handle.includes('s')) bottom += dy;

    // Giữ từng cạnh trong canvas để tay nắm không chạy mất khỏi vùng nhìn thấy.
    left = Math.max(0, Math.min(STAGE_W, left));
    right = Math.max(0, Math.min(STAGE_W, right));
    top = Math.max(0, Math.min(STAGE_H, top));
    bottom = Math.max(0, Math.min(STAGE_H, bottom));

    // Giữ kích thước tối thiểu, nhưng vẫn neo đúng cạnh đối diện.
    if (right - left < MIN_W) {
      if (handle.includes('w')) left = Math.max(0, right - MIN_W);
      else right = Math.min(STAGE_W, left + MIN_W);
    }
    if (bottom - top < MIN_H) {
      if (handle.includes('n')) top = Math.max(0, bottom - MIN_H);
      else bottom = Math.min(STAGE_H, top + MIN_H);
    }

    return {
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      w: right - left,
      h: bottom - top,
    };
  }, []);

  const boxRef = useRef<BoxState>(box);
  const dragElementRef = useRef<HTMLDivElement>(null);
  const subtitleBoxRef = useRef<HTMLDivElement>(null);
  const lastPreviewCommitRef = useRef(0);

  useEffect(() => {
    boxRef.current = box;
  }, [box]);

  const updateDragDom = useCallback((next: BoxState) => {
    const dragEl = dragElementRef.current;
    if (dragEl) {
      dragEl.style.left = `${(next.x / STAGE_W) * 100}%`;
      dragEl.style.top = `${(next.y / STAGE_H) * 100}%`;
      dragEl.style.width = `${(next.w / STAGE_W) * 100}%`;
      dragEl.style.height = `${(next.h / STAGE_H) * 100}%`;
    }
  }, []);

  const applyPointerMove = useCallback(() => {
    const session = sessionRef.current;
    if (!session || !session.pendingEvent) return;

    const event = session.pendingEvent;
    session.pendingEvent = null;
    session.rafId = null;

    const dx = (event.clientX - session.startClientX) * session.scaleX;
    const dy = (event.clientY - session.startClientY) * session.scaleY;
    const next = session.mode === 'move'
      ? clampBox({
          ...session.startBox,
          x: session.startBox.x + dx,
          y: session.startBox.y + dy,
        })
      : (session.handle
          ? resizeBox(session.startBox, session.handle, dx, dy)
          : session.startBox);

    session.currentBox = next;
    updateDragDom(next);

    const now = performance.now();
    // Cập nhật React chậm hơn DOM để tránh render lại liên tục khi kéo
    if (now - lastPreviewCommitRef.current >= 80) {
      lastPreviewCommitRef.current = now;
      setDragPreview(next);
    }
  }, [clampBox, resizeBox, updateDragDom]);

  const scheduleApply = useCallback((event: PointerEvent) => {
    const session = sessionRef.current;
    if (!session) return;
    session.pendingEvent = event;
    if (session.rafId == null) {
      session.rafId = requestAnimationFrame(applyPointerMove);
    }
  }, [applyPointerMove]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const scene = sceneRef.current;
    const dragEl = dragElementRef.current;
    if (!scene || !dragEl) return;

    event.preventDefault();
    event.stopPropagation();

    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>('[data-handle]')
      : null;
    const handle = target?.dataset.handle as SelectionHandle | undefined;
    // Các nút resize không được kích hoạt hành vi button mặc định
    if (handle) event.currentTarget.focus();
    const rect = scene.getBoundingClientRect();
    const startBox = boxRef.current;
    const scaleX = STAGE_W / Math.max(1, rect.width);
    const scaleY = STAGE_H / Math.max(1, rect.height);

    sessionRef.current = {
      mode: handle ? 'resize' : 'move',
      handle,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox,
      currentBox: startBox,
      scaleX,
      scaleY,
      rafId: null,
      pendingEvent: null,
    };

    lastPreviewCommitRef.current = performance.now();
    updateDragDom(startBox);
    setDragPreview(startBox);
    try {
      dragEl.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; React pointer events remain active on the element.
    }

    setDragging(true);
    document.body.classList.add('rdvd-dragging');
    document.body.style.cursor = handle ? CURSOR_BY_HANDLE[handle] : 'grabbing';
  }, []);

  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    event.preventDefault();
    scheduleApply(event.nativeEvent);
  }, [scheduleApply]);

  const endSession = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session) return;
    if (event && event.pointerId !== session.pointerId) return;

    if (session.pendingEvent) {
      applyPointerMove();
    }
    if (session.rafId != null) {
      cancelAnimationFrame(session.rafId);
    }

    const finalBox = clampBox(session.currentBox);
    boxRef.current = finalBox;
    setBox(finalBox);
    setDragPreview(null);
    sessionRef.current = null;
    setDragging(false);
    document.body.classList.remove('rdvd-dragging');
    document.body.style.cursor = '';

    const dragEl = dragElementRef.current;
    if (dragEl && dragEl.hasPointerCapture(session.pointerId)) {
      try { dragEl.releasePointerCapture(session.pointerId); } catch {}
    }
  }, [applyPointerMove]);

  useEffect(() => {
    return () => {
      const session = sessionRef.current;
      if (session?.rafId != null) cancelAnimationFrame(session.rafId);
      document.body.classList.remove('rdvd-dragging');
      document.body.style.cursor = '';
    };
  }, []);

  useEffect(() => {
    logoBoxRef.current = logoBox;
  }, [logoBox]);

  const clampLogoBox = useCallback((value: BoxState): BoxState => {
    const w = Math.min(STAGE_W, Math.max(40, value.w));
    const h = Math.min(STAGE_H, Math.max(24, value.h));
    const x = Math.max(w / 2, Math.min(STAGE_W - w / 2, value.x));
    const y = Math.max(h / 2, Math.min(STAGE_H - h / 2, value.y));
    return { x, y, w, h };
  }, []);

  const resizeLogoBox = useCallback((start: BoxState, handle: SelectionHandle, dx: number, dy: number): BoxState => {
    let left = start.x - start.w / 2;
    let right = start.x + start.w / 2;
    let top = start.y - start.h / 2;
    let bottom = start.y + start.h / 2;
    if (handle.includes('w')) left += dx;
    if (handle.includes('e')) right += dx;
    if (handle.includes('n')) top += dy;
    if (handle.includes('s')) bottom += dy;
    if (right - left < 40) {
      if (handle.includes('w')) left = right - 40; else right = left + 40;
    }
    if (bottom - top < 24) {
      if (handle.includes('n')) top = bottom - 24; else bottom = top + 24;
    }
    return clampLogoBox({ x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top });
  }, [clampLogoBox]);

  const handleLogoPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!logoUrl || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const scene = sceneRef.current;
    const element = logoElementRef.current;
    if (!scene || !element) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-logo-handle]') : null;
    const handle = target?.dataset.logoHandle as SelectionHandle | undefined;
    const rect = scene.getBoundingClientRect();
    const startBox = logoBoxRef.current;
    logoDragRef.current = {
      mode: handle ? 'resize' : 'move', handle,
      pointerId: event.pointerId, startClientX: event.clientX, startClientY: event.clientY,
      startBox, scaleX: STAGE_W / Math.max(1, rect.width), scaleY: STAGE_H / Math.max(1, rect.height),
    };
    try { element.setPointerCapture(event.pointerId); } catch {}
    setLogoDragging(true);
  }, [logoUrl]);

  const handleLogoPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const session = logoDragRef.current;
    if (!session || event.pointerId !== session.pointerId) return;
    event.preventDefault();
    const dx = (event.clientX - session.startClientX) * session.scaleX;
    const dy = (event.clientY - session.startClientY) * session.scaleY;
    const next = session.mode === 'move'
      ? clampLogoBox({ ...session.startBox, x: session.startBox.x + dx, y: session.startBox.y + dy })
      : (session.handle ? resizeLogoBox(session.startBox, session.handle, dx, dy) : session.startBox);
    logoBoxRef.current = next;
    setLogoBox(next);
  }, [clampLogoBox, resizeLogoBox]);

  const endLogoDrag = useCallback((event?: React.PointerEvent<HTMLDivElement>) => {
    const session = logoDragRef.current;
    if (!session) return;
    if (event && event.pointerId !== session.pointerId) return;
    logoDragRef.current = null;
    setLogoDragging(false);
    const element = logoElementRef.current;
    if (element && element.hasPointerCapture(session.pointerId)) {
      try { element.releasePointerCapture(session.pointerId); } catch {}
    }
  }, []);

  useEffect(() => () => {
    if (logoUrl) URL.revokeObjectURL(logoUrl);
  }, [logoUrl]);

  useEffect(() => {
    const player = videoRef.current;
    if (!player) return;
    player.loop = loopPlayback;
    const backgroundFactor = backgroundAudioMode === 'reduce' ? 0.1 : 1;
    player.volume = Math.max(0, Math.min(1, volume * backgroundFactor));
    player.muted = isMuted || backgroundAudioMode === 'mute';
  }, [volume, isMuted, videoUrl, loopPlayback, backgroundAudioMode]);

  useEffect(() => {
    const dubbed = dubbedAudioRef.current;
    if (!dubbed) return;
    // A2 has its own fixed 0 dB preview bus. A1 background reduction and the
    // video volume slider must never alter dubbed speech gain.
    dubbed.volume = 1;
  }, [backgroundAudioMode, dubbedAudioUrl, volume]);

  useEffect(() => {
    const video = videoRef.current;
    const dubbed = dubbedAudioRef.current;
    if (!video || !dubbed || !dubbedAudioUrl) return;

    const syncPosition = () => {
      if (Math.abs(dubbed.currentTime - video.currentTime) > 0.2) {
        const maximum = Number.isFinite(dubbed.duration) && dubbed.duration > 0
          ? Math.max(0, dubbed.duration - 0.001)
          : video.currentTime;
        dubbed.currentTime = Math.min(video.currentTime, maximum);
      }
    };
    let transportRequested = false;
    let playPending = false;
    const requestDubbedPlayback = (failureLabel: string) => {
      if (!dubbed.paused || playPending) return;
      playPending = true;
      void dubbed.play().catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        addLog(`${failureLabel}: ${String(error)}`, 'AUDIO');
      }).finally(() => { playPending = false; });
    };
    const playDubbed = () => {
      transportRequested = true;
      syncPosition();
      requestDubbedPlayback('Không phát được track A2 theo lệnh Play');
    };
    const pauseDubbed = () => {
      transportRequested = false;
      dubbed.pause();
    };
    const syncRate = () => { dubbed.playbackRate = video.playbackRate; };
    const prepareDubbed = () => {
      // Loading a new A2 source must never start playback by itself. The
      // transport is owned exclusively by an explicit video Play event.
      syncRate();
      syncPosition();
      if (transportRequested && !video.paused && !video.ended) {
        requestDubbedPlayback('Không phát được track A2 sau lệnh Play');
      } else {
        dubbed.pause();
      }
    };

    dubbed.muted = dubbedTrackMuted;
    prepareDubbed();
    video.addEventListener('play', playDubbed);
    video.addEventListener('playing', playDubbed);
    video.addEventListener('pause', pauseDubbed);
    video.addEventListener('ended', pauseDubbed);
    video.addEventListener('seeking', syncPosition);
    video.addEventListener('timeupdate', syncPosition);
    video.addEventListener('ratechange', syncRate);
    dubbed.addEventListener('canplay', prepareDubbed);
    return () => {
      video.removeEventListener('play', playDubbed);
      video.removeEventListener('playing', playDubbed);
      video.removeEventListener('pause', pauseDubbed);
      video.removeEventListener('ended', pauseDubbed);
      video.removeEventListener('seeking', syncPosition);
      video.removeEventListener('timeupdate', syncPosition);
      video.removeEventListener('ratechange', syncRate);
      dubbed.removeEventListener('canplay', prepareDubbed);
      dubbed.pause();
    };
  }, [addLog, dubbedAudioUrl, dubbedTrackMuted, videoUrl, videoRef]);

  const activeBox = dragPreview ?? box;
  const subtitleDragStyle = useMemo(() => ({
    left: `${(activeBox.x / STAGE_W) * 100}%`,
    top: `${(activeBox.y / STAGE_H) * 100}%`,
    width: `${(activeBox.w / STAGE_W) * 100}%`,
    height: `${(activeBox.h / STAGE_H) * 100}%`,
  }), [activeBox.x, activeBox.y, activeBox.w, activeBox.h]);

  const resetAppSettings = useCallback(() => {
    setLanguage('vi'); setTheme('dark'); setGlobalShortcutsEnabled(true); setPlaybackSeekStep(5);
    setLoopPlayback(false); setStartMuted(false); setDefaultTimelineZoom(1); setAutoSubtitleFrame(true);
    setSubtitlePanelStartup(false); setReduceMotion(false); setSettingsTab('general'); setShowSettings(false);
  }, []);

  const resetSubtitleDefaults = () => {
    setBox({ x: 964.21, y: 877.69, w: 960, h: 52 });
    setSubtitleSize(40);
    setSubtitleColor('#FFFFFF');
    setSubtitleBg('#363032');
    setSubtitleOpacity(1);
    setSubtitleOutline(true);
    setSubtitleOutlineWidth(4);
  };

  return (
    <div className={"rdvd-app" + (reduceMotion ? " reduced-motion" : "")} data-theme={theme}>
      <audio
        ref={dubbedAudioRef}
        className="rdvd-internal-dubbed-audio"
        src={dubbedAudioUrl ?? undefined}
        preload="auto"
        onLoadedMetadata={(event) => {
          const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
          addLog(`WAV A2 đã nạp và sẵn sàng phát: ${duration.toFixed(2)}s.`, 'AUDIO');
        }}
        onPlay={() => addLog('Track A2 bắt đầu phát đồng bộ với video.', 'AUDIO')}
        onError={(event) => {
          const mediaError = event.currentTarget.error;
          addLog(`Không nạp/phát được WAV A2 (MediaError ${mediaError?.code ?? 0}): ${mediaError?.message || ttsGeneration?.outputPath || 'không rõ đường dẫn'}`, 'ERROR');
        }}
      />
      <Topbar
        t={t} language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme}
        showLanguageMenu={showLanguageMenu} setShowLanguageMenu={setShowLanguageMenu}
        showThemeMenu={showThemeMenu} setShowThemeMenu={setShowThemeMenu}
        showSettings={showSettings} setShowSettings={setShowSettings} menuPosition={menuPosition}
        languageButtonRef={languageButtonRef} themeButtonRef={themeButtonRef}
        positionTopbarMenu={positionTopbarMenu}
      />

      {showSettings && <SettingsDialog
        t={t} settingsTab={settingsTab} setSettingsTab={setSettingsTab}
        language={language} setLanguage={setLanguage} theme={theme} setTheme={setTheme}
        globalShortcutsEnabled={globalShortcutsEnabled} setGlobalShortcutsEnabled={setGlobalShortcutsEnabled}
        reduceMotion={reduceMotion} setReduceMotion={setReduceMotion}
        playbackSeekStep={playbackSeekStep} setPlaybackSeekStep={setPlaybackSeekStep}
        loopPlayback={loopPlayback} setLoopPlayback={setLoopPlayback}
        startMuted={startMuted} setStartMuted={setStartMuted}
        subtitlePanelStartup={subtitlePanelStartup} setSubtitlePanelStartup={setSubtitlePanelStartup}
        autoSubtitleFrame={autoSubtitleFrame} setAutoSubtitleFrame={setAutoSubtitleFrame}
        defaultTimelineZoom={defaultTimelineZoom} setDefaultTimelineZoom={setDefaultTimelineZoom}
        resetAppSettings={resetAppSettings} onClose={() => setShowSettings(false)}
      />}
      <main className="rdvd-main">
        <WorkflowSidebar
          t={t} language={language} sourceLanguage={sourceLanguage} setSourceLanguage={setSourceLanguage} videoInputRef={videoInputRef} handleVideoFile={handleVideoFile}
          videoFile={videoFile} removeVideo={removeVideo} recognizeMode={recognizeMode}
          setRecognizeMode={setRecognizeMode} dialogueInputRef={dialogueInputRef}
          dialogueFile={dialogueFile} handleDialogueFile={handleDialogueFile}
          translatedInputRef={translatedInputRef} translatedFile={translatedFile}
          handleTranslatedFile={handleTranslatedFile} voice={voice} setVoice={setVoice}
          translationEnvironment={translationEnvironment}
          translationRunning={translationRunning} translationProgress={translationProgress}
          handleStartTranslation={handleStartTranslation}
          savedTranslationPath={savedTranslationFile?.outputPath ?? null}
          handleOpenTranslationFolder={handleOpenTranslationFolder}
          speed={speed} setSpeed={setSpeed} pitch={pitch} setPitch={setPitch}
          voicePreview={voicePreview} voicePreviewLoading={voicePreviewLoading} voicePreviewError={voicePreviewError}
          pipelineSourceReady={(translationAccepted && Boolean(ttsText.trim())) || Boolean(dialogueFile && translationEngineReady)}
          ttsEnvironment={ttsEnvironment} voiceEngineState={voiceEngineState}
          refreshTtsEnvironment={refreshTtsEnvironment}
          generationRunning={generationRunning}
          canGenerateVoice={translationAccepted && Boolean(ttsText.trim()) && voiceEngineState === 'ready'}
          handleGenerateVoice={handleGenerateVoice}
          ttsGeneration={ttsGeneration}
          backgroundAudioMode={backgroundAudioMode} setBackgroundAudioMode={setBackgroundAudioMode}
          pipelineDone={pipelineDone} pipelineRunning={pipelineRunning} pipeline={pipeline}
          startAutoPipeline={startAutoPipeline} autoActionLabel={autoActionLabel}
          exportLog={exportLog} openLogFolder={openLogFolder} clearLog={clearLog}
          renderLogs={renderLogs} progressView={pipelineProgressView} addLog={addLog}
        />

        <section className="rdvd-workspace">
          <VideoPreview
            t={t} language={language} showSubtitlePanel={showSubtitlePanel} setShowSubtitlePanel={setShowSubtitlePanel}
            logoInputRef={logoInputRef} logoFile={logoFile} handleLogoFile={handleLogoFile}
            sceneRef={sceneRef} setIsPointerOverPlayer={setIsPointerOverPlayer} requestSceneFullscreen={requestSceneFullscreen}
            videoFile={videoFile} videoUrl={videoUrl} videoRef={videoRef} setVideoDuration={setVideoDuration}
            setVideoCurrentTime={setVideoCurrentTime} setIsVideoPlaying={setIsVideoPlaying} addLog={addLog}
            videoTrackVisible={videoTrackVisible} isPointerOverPlayer={isPointerOverPlayer} isVideoPlaying={isVideoPlaying}
            subtitleFrameVisible={subtitleFrameVisible} dragging={dragging} hasDialogue={hasDialogue}
            subtitleVisible={subtitleVisible} subtitleDragStyle={subtitleDragStyle} subtitleColor={subtitleColor}
            subtitleBg={subtitleBg} subtitleOpacity={subtitleOpacity} subtitleSize={subtitleSize}
            subtitleOutline={subtitleOutline} subtitleOutlineWidth={subtitleOutlineWidth}
            subtitleText={activeSubtitleText}
            subtitleSegments={subtitleSegments}
            activeSubtitleIndex={activeSubtitleIndex}
            setSubtitleSegments={setSubtitleSegments}
            dragElementRef={dragElementRef} subtitleBoxRef={subtitleBoxRef} handlePointerDown={handlePointerDown}
            handlePointerMove={handlePointerMove} endSession={endSession} logoUrl={logoUrl} logoBox={logoBox}
            logoDragging={logoDragging} logoElementRef={logoElementRef} handleLogoPointerDown={handleLogoPointerDown}
            handleLogoPointerMove={handleLogoPointerMove} endLogoDrag={endLogoDrag} removeLogo={removeLogo}
            videoCurrentTime={videoCurrentTime} videoDuration={videoDuration} playbackSeekStep={playbackSeekStep}
            isMuted={isMuted} setIsMuted={setIsMuted} timelineMuted={timelineMuted} setTimelineMuted={setTimelineMuted}
            volume={volume} setVolume={setVolume} setSubtitleFrameVisible={setSubtitleFrameVisible}
            setSubtitleVisible={setSubtitleVisible} dragPreview={dragPreview} box={box} setBox={setBox}
            clampBox={clampBox} setSubtitleSize={setSubtitleSize} setSubtitleColor={setSubtitleColor}
            setSubtitleBg={setSubtitleBg} setSubtitleOpacity={setSubtitleOpacity}
            setSubtitleOutline={setSubtitleOutline} setSubtitleOutlineWidth={setSubtitleOutlineWidth}
            resetSubtitleDefaults={resetSubtitleDefaults}
          />

          <EditPanel
            t={t} pipelineDone={pipelineDone} editTab={editTab} setEditTab={setEditTab}
            addLog={addLog} exportQueued={exportQueued} handleFinalExport={handleFinalExport}
          />

          <Timeline
            t={t} openTimelineMenu={openTimelineMenu} timelineScrollRef={timelineScrollRef}
            timelineZoom={timelineZoom} setTimelineZoom={setTimelineZoom} timelineRulerDuration={timelineRulerDuration}
            timelineScrubbing={timelineScrubbing} setTimelineScrubbing={setTimelineScrubbing}
            seekFromTimelineRulerPointer={seekFromTimelineRulerPointer} endTimelineScrub={endTimelineScrub}
            startTimelineScrub={startTimelineScrub} moveTimelineScrub={moveTimelineScrub} seekFromTimelinePointer={seekFromTimelinePointer}
            videoTrackVisible={videoTrackVisible} setVideoTrackVisible={setVideoTrackVisible}
            videoTrackLocked={videoTrackLocked} setVideoTrackLocked={setVideoTrackLocked}
            videoTrackSync={videoTrackSync} setVideoTrackSync={setVideoTrackSync}
            videoThumbnails={videoThumbnails} videoFile={videoFile} videoDuration={projectTimelineDuration}
            timelineMarkers={timelineMarkers} setTimelineMarkers={setTimelineMarkers}
            audioTrackSolo={audioTrackSolo} setAudioTrackSolo={setAudioTrackSolo}
            timelineMuted={timelineMuted} setTimelineMuted={setTimelineMuted}
            audioTrackLocked={audioTrackLocked} setAudioTrackLocked={setAudioTrackLocked}
            audioTrackSync={audioTrackSync} setAudioTrackSync={setAudioTrackSync}
            audioWaveform={audioWaveform} setIsMuted={setIsMuted} videoRef={videoRef}
            subtitleTrackVisible={subtitleTrackVisible} setSubtitleTrackVisible={setSubtitleTrackVisible}
            subtitleTrackLocked={subtitleTrackLocked} setSubtitleTrackLocked={setSubtitleTrackLocked}
            subtitleSegments={subtitleSegments} translatedFile={translatedFile} seekVideo={seekVideo}
            dubbedTrackSolo={dubbedTrackSolo} setDubbedTrackSolo={setDubbedTrackSolo}
            dubbedTrackMuted={dubbedTrackMuted} setDubbedTrackMuted={setDubbedTrackMuted}
            dubbedTrackLocked={dubbedTrackLocked} setDubbedTrackLocked={setDubbedTrackLocked}
            dubbedTrackSync={dubbedTrackSync} setDubbedTrackSync={setDubbedTrackSync}
            pipelineDone={pipelineDone} ttsGeneration={ttsGeneration} videoCurrentTime={videoCurrentTime}
            timelineContextMenu={timelineContextMenu} setTimelineContextMenu={setTimelineContextMenu}
          />
        </section>
      </main>
    </div>
  );
}
