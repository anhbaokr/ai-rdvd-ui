import { useEffect, useRef } from 'react';
import type { CSSProperties, Dispatch, PointerEventHandler, RefObject, SetStateAction } from 'react';
import type { BoxState, Language, SubtitleSegment, UiText } from '../../types';
import { formatTimecode } from '../../utils/timecode';
import { LogoOverlay } from './LogoOverlay';
import { SubtitleOverlay } from './SubtitleOverlay';

interface VideoPreviewProps {
  t: UiText;
  language: Language;
  showSubtitlePanel: boolean;
  setShowSubtitlePanel: Dispatch<SetStateAction<boolean>>;
  logoInputRef: RefObject<HTMLInputElement | null>;
  logoFile: File | null;
  handleLogoFile: (file: File | null) => void;
  sceneRef: RefObject<HTMLDivElement | null>;
  setIsPointerOverPlayer: Dispatch<SetStateAction<boolean>>;
  requestSceneFullscreen: () => void;
  videoFile: File | null;
  videoUrl: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  setVideoDuration: Dispatch<SetStateAction<number>>;
  setVideoCurrentTime: Dispatch<SetStateAction<number>>;
  setIsVideoPlaying: Dispatch<SetStateAction<boolean>>;
  addLog: (message: string) => void;
  videoTrackVisible: boolean;
  isPointerOverPlayer: boolean;
  isVideoPlaying: boolean;
  subtitleFrameVisible: boolean;
  dragging: boolean;
  hasDialogue: boolean;
  subtitleVisible: boolean;
  subtitleDragStyle: CSSProperties;
  subtitleColor: string;
  subtitleBg: string;
  subtitleOpacity: number;
  subtitleSize: number;
  subtitleOutline: boolean;
  subtitleOutlineWidth: number;
  subtitleText: string;
  subtitleSegments: SubtitleSegment[];
  activeSubtitleIndex: number;
  setSubtitleSegments: Dispatch<SetStateAction<SubtitleSegment[]>>;
  dragElementRef: RefObject<HTMLDivElement | null>;
  subtitleBoxRef: RefObject<HTMLDivElement | null>;
  handlePointerDown: PointerEventHandler<HTMLDivElement>;
  handlePointerMove: PointerEventHandler<HTMLDivElement>;
  endSession: PointerEventHandler<HTMLDivElement>;
  logoUrl: string | null;
  logoBox: BoxState;
  logoDragging: boolean;
  logoElementRef: RefObject<HTMLDivElement | null>;
  handleLogoPointerDown: PointerEventHandler<HTMLDivElement>;
  handleLogoPointerMove: PointerEventHandler<HTMLDivElement>;
  endLogoDrag: PointerEventHandler<HTMLDivElement>;
  removeLogo: () => void;
  videoCurrentTime: number;
  videoDuration: number;
  playbackSeekStep: number;
  isMuted: boolean;
  setIsMuted: Dispatch<SetStateAction<boolean>>;
  timelineMuted: boolean;
  setTimelineMuted: Dispatch<SetStateAction<boolean>>;
  volume: number;
  setVolume: Dispatch<SetStateAction<number>>;
  setSubtitleFrameVisible: Dispatch<SetStateAction<boolean>>;
  setSubtitleVisible: Dispatch<SetStateAction<boolean>>;
  dragPreview: BoxState | null;
  box: BoxState;
  setBox: Dispatch<SetStateAction<BoxState>>;
  clampBox: (value: BoxState) => BoxState;
  setSubtitleSize: Dispatch<SetStateAction<number>>;
  setSubtitleColor: Dispatch<SetStateAction<string>>;
  setSubtitleBg: Dispatch<SetStateAction<string>>;
  setSubtitleOpacity: Dispatch<SetStateAction<number>>;
  setSubtitleOutline: Dispatch<SetStateAction<boolean>>;
  setSubtitleOutlineWidth: Dispatch<SetStateAction<number>>;
  resetSubtitleDefaults: () => void;
}

export function VideoPreview(props: VideoPreviewProps) {
  const {
    t, language, showSubtitlePanel, setShowSubtitlePanel, logoInputRef, logoFile,
    handleLogoFile, sceneRef, setIsPointerOverPlayer, requestSceneFullscreen,
    videoFile, videoUrl, videoRef, setVideoDuration, setVideoCurrentTime,
    setIsVideoPlaying, addLog, videoTrackVisible, isPointerOverPlayer, isVideoPlaying,
    subtitleFrameVisible, dragging, hasDialogue, subtitleVisible, subtitleDragStyle,
    subtitleColor, subtitleBg, subtitleOpacity, subtitleSize,
    subtitleOutline, subtitleOutlineWidth, subtitleText, subtitleSegments, activeSubtitleIndex, setSubtitleSegments, dragElementRef, subtitleBoxRef,
    handlePointerDown, handlePointerMove, endSession, logoUrl, logoBox, logoDragging,
    logoElementRef, handleLogoPointerDown, handleLogoPointerMove, endLogoDrag,
    removeLogo, videoCurrentTime, videoDuration, playbackSeekStep, isMuted, setIsMuted,
    timelineMuted, setTimelineMuted, volume, setVolume, setSubtitleFrameVisible,
    setSubtitleVisible, dragPreview, box, setBox, clampBox, setSubtitleSize,
    setSubtitleColor, setSubtitleBg, setSubtitleOpacity,
    setSubtitleOutline, setSubtitleOutlineWidth, resetSubtitleDefaults,
  } = props;

  const subtitlePanelRef = useRef<HTMLDivElement | null>(null);
  const subtitlePanelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!showSubtitlePanel) return;

    const closeWhenPointerIsOutside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (subtitlePanelRef.current?.contains(target)) return;
      if (subtitlePanelButtonRef.current?.contains(target)) return;
      setShowSubtitlePanel(false);
    };

    document.addEventListener('pointerdown', closeWhenPointerIsOutside);
    return () => document.removeEventListener('pointerdown', closeWhenPointerIsOutside);
  }, [showSubtitlePanel, setShowSubtitlePanel]);

  return (
      <div className="rdvd-player-shell">
        <div className="rdvd-player-head">
          <span>{t.preview}</span>
          <div className="rdvd-player-head-actions">
            <button
              ref={subtitlePanelButtonRef}
              className={showSubtitlePanel ? 'subtitle-head-btn active' : 'subtitle-head-btn'}
              onClick={() => setShowSubtitlePanel((v) => !v)}
              aria-pressed={showSubtitlePanel}
              aria-keyshortcuts="Ctrl+Shift+S"
              title={`${t.subtitleCustomize} — Ctrl+Shift+S`}
            >
              <span>▣ {t.subtitleCustomize}</span>
              <kbd>Ctrl&nbsp;Shift&nbsp;S</kbd>
            </button>
            <button type="button" onClick={() => logoInputRef.current?.click()} title={logoFile ? t.replaceLogo : t.importLogo}>▧ {logoFile ? t.replaceLogo : t.importLogo}</button>
          </div>
        </div>
        <input ref={logoInputRef} className="rdvd-hidden-file" type="file" accept="image/*" onChange={(event) => handleLogoFile(event.target.files?.[0] ?? null)} />
        <div className="rdvd-player">
          <div className="rdvd-scene" ref={sceneRef} onMouseEnter={() => setIsPointerOverPlayer(true)} onMouseLeave={() => setIsPointerOverPlayer(false)} onDoubleClick={requestSceneFullscreen}>
            {videoFile && videoUrl ? (
              <video
                key={videoUrl}
                ref={videoRef}
                className="rdvd-preview-media"
                src={videoUrl}
                preload="auto"
                playsInline
                onLoadedMetadata={(event) => {
                  const duration = Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0;
                  setVideoDuration(duration);
                  setVideoCurrentTime(0);
                  event.currentTarget.currentTime = 0;
                }}
                onLoadedData={() => setIsVideoPlaying(false)}
                onTimeUpdate={(event) => setVideoCurrentTime(event.currentTarget.currentTime)}
                onPlay={() => setIsVideoPlaying(true)}
                onPause={() => setIsVideoPlaying(false)}
                onEnded={() => setIsVideoPlaying(false)}
                onError={() => addLog(language === 'vi' ? 'Không thể phát video trong Preview.' : 'The video could not be played in Preview.')}
              />
            ) : (
              <img className="rdvd-preview-media rdvd-preview-placeholder" src="/preview.png" alt={language === 'vi' ? 'Xem trước' : 'Preview'} />
            )}
            <div className={`rdvd-scene-overlay${videoTrackVisible ? "" : " track-hidden"}`} />
            {videoFile && isPointerOverPlayer && (
              <button className="rdvd-center-play" aria-label={isVideoPlaying ? t.pauseVideo : t.playVideo} onClick={() => { const player = videoRef.current; if (!player) return; if (player.paused) void player.play(); else player.pause(); }}>
                {isVideoPlaying ? 'Ⅱ' : '▶'}
              </button>
            )}
            {videoFile && subtitleFrameVisible && <SubtitleOverlay
              t={t} dragging={dragging} subtitleVisible={subtitleVisible}
              subtitleDragStyle={subtitleDragStyle} subtitleColor={subtitleColor} subtitleBg={subtitleBg}
              subtitleOpacity={subtitleOpacity} subtitleSize={subtitleSize}
              subtitleOutline={subtitleOutline} subtitleOutlineWidth={subtitleOutlineWidth}
              subtitleText={subtitleText}
              dragElementRef={dragElementRef} subtitleBoxRef={subtitleBoxRef}
              onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerEnd={endSession}
            />}
            {videoFile && logoUrl && <LogoOverlay
              t={t} logoUrl={logoUrl} logoFile={logoFile} logoBox={logoBox}
              logoDragging={logoDragging} logoElementRef={logoElementRef}
              onPointerDown={handleLogoPointerDown} onPointerMove={handleLogoPointerMove}
              onPointerEnd={endLogoDrag} removeLogo={removeLogo}
            />}
          </div>
          <div className="rdvd-controls">
            <span>{formatTimecode(videoCurrentTime)} / {formatTimecode(videoDuration)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0.01, videoDuration)}
              step={0.01}
              value={Math.min(videoCurrentTime, videoDuration || 0)}
              disabled={!videoFile || !videoDuration}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (videoRef.current) videoRef.current.currentTime = next;
                setVideoCurrentTime(next);
              }}
            />
            <button disabled={!videoFile} onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - playbackSeekStep); }}>◀</button>
            <button
              className="play"
              disabled={!videoFile}
              onClick={() => {
                const player = videoRef.current;
                if (!player) return;
                if (player.paused) void player.play();
                else player.pause();
              }}
            >{isVideoPlaying ? 'Ⅱ' : '▶'}</button>
            <button disabled={!videoFile} onClick={() => { if (videoRef.current) videoRef.current.currentTime = Math.min(videoDuration || 0, videoRef.current.currentTime + playbackSeekStep); }}>▶</button>
            <div className="rdvd-volume-control" title={t.volume}>
              <button type="button" className="volume-toggle" disabled={!videoFile} aria-label={isMuted ? t.unmuteVolume : t.muteVolume} aria-pressed={isMuted} onClick={() => { const next = !isMuted; setIsMuted(next); setTimelineMuted(next); if (videoRef.current) videoRef.current.muted = next; }}>{isMuted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}</button>
              <input className="volume" aria-label={t.volume} type="range" min={0} max={1} step={0.01} value={isMuted ? 0 : volume} disabled={!videoFile} onChange={(event) => { const next = Number(event.target.value); setVolume(next); setIsMuted(next === 0); setTimelineMuted(next === 0); if (videoRef.current) { videoRef.current.volume = next; videoRef.current.muted = next === 0; } }} />
            </div>
            <button
              className={subtitleFrameVisible ? 'cc-on' : 'cc-off'}
              onClick={() => {
                const next = !subtitleFrameVisible;
                setSubtitleFrameVisible(next);
                setSubtitleVisible(next);
              }}
              aria-pressed={subtitleFrameVisible}
              title={subtitleFrameVisible ? t.hideSubtitle : t.showSubtitle}
            >CC</button><button type="button" onClick={requestSceneFullscreen} title={document.fullscreenElement ? 'Thoát toàn màn hình' : t.fullscreen}>⛶</button>
          </div>
        </div>
        {showSubtitlePanel && (
          <div ref={subtitlePanelRef} className="rdvd-subtitle-panel">
            <div className="rdvd-panel-head"><span>{t.subtitleCustomize}</span><button aria-label={t.closePanel} title={t.closePanel} onClick={() => setShowSubtitlePanel(false)}>×</button></div>
            <div className="rdvd-panel-row subtitle-text-edit-row">
              <label>Nội dung</label>
              <textarea
                value={activeSubtitleIndex >= 0 ? subtitleSegments[activeSubtitleIndex]?.text ?? '' : ''}
                placeholder={activeSubtitleIndex >= 0 ? 'Nhập nội dung phụ đề…' : 'Phát tới một câu phụ đề để chỉnh sửa'}
                disabled={activeSubtitleIndex < 0}
                onChange={(event) => {
                  if (activeSubtitleIndex < 0) return;
                  const nextText = event.target.value;
                  setSubtitleSegments((items) => items.map((item, index) => index === activeSubtitleIndex ? { ...item, text: nextText } : item));
                }}
              />
            </div>
            <div className="rdvd-panel-row">
              <label>{t.subtitlePosition}</label>
              <div className="dual-input">
                <input type="number" value={(dragPreview ?? box).x} onChange={(e) => setBox((b) => clampBox({ ...b, x: Number(e.target.value) || 0 }))} />
                <input type="number" value={(dragPreview ?? box).y} onChange={(e) => setBox((b) => clampBox({ ...b, y: Number(e.target.value) || 0 }))} />
              </div>
            </div>
            <div className="rdvd-panel-row"><label>{t.fontSize}</label><input type="number" value={subtitleSize} onChange={(e) => setSubtitleSize(Number(e.target.value) || 1)} /></div>
            <div className="rdvd-panel-row"><label>{t.textColor}</label><div className="color-value"><input className="color-picker" type="color" value={subtitleColor} onChange={(e) => setSubtitleColor(e.target.value.toUpperCase())} /><span>{subtitleColor}</span></div></div>
            <div className="rdvd-panel-row"><label>{t.backgroundColor}</label><div className="color-value"><input className="color-picker" type="color" value={subtitleBg} onChange={(e) => setSubtitleBg(e.target.value.toUpperCase())} /><span>{subtitleBg}</span></div></div>
            <div className="rdvd-panel-row transparency-row"><label>{t.transparency}</label><input type="range" min="0" max="100" value={subtitleOpacity} onChange={(e) => setSubtitleOpacity(Number(e.target.value))} /><span>{subtitleOpacity}%</span></div>
            <div className="rdvd-panel-row"><label>{t.fontStyle}</label><div className="rdvd-fixed-font">AI RDvD Review · Vietnamese</div></div>
            <div className="rdvd-panel-row"><label>{t.outline}</label><div className="dual-input"><select value={subtitleOutline ? 'yes' : 'no'} onChange={(e) => setSubtitleOutline(e.target.value === 'yes')}><option value="yes">{t.yes}</option><option value="no">{t.no}</option></select><input type="number" min="0" max="10" value={subtitleOutlineWidth} onChange={(e) => setSubtitleOutlineWidth(Number(e.target.value) || 0)} /></div></div>
            <button className="rdvd-reset-subtitle" onClick={resetSubtitleDefaults}>{t.resetSubtitle}</button>
          </div>
        )}
      </div>
  );
}
