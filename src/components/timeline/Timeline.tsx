import React from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { SubtitleSegment, TtsGenerationResult, UiText } from '../../types';
import { formatTimecode } from '../../utils/timecode';

interface TimelineProps {
  t: UiText;
  openTimelineMenu: (event: React.MouseEvent<HTMLElement>) => void;
  timelineScrollRef: RefObject<HTMLDivElement | null>;
  timelineZoom: number;
  setTimelineZoom: Dispatch<SetStateAction<number>>;
  timelineRulerDuration: number;
  timelineScrubbing: boolean;
  setTimelineScrubbing: Dispatch<SetStateAction<boolean>>;
  seekFromTimelineRulerPointer: (event: React.PointerEvent<HTMLElement>) => void;
  endTimelineScrub: (event: React.PointerEvent<HTMLElement>) => void;
  startTimelineScrub: (event: React.PointerEvent<HTMLElement>) => void;
  moveTimelineScrub: (event: React.PointerEvent<HTMLElement>) => void;
  seekFromTimelinePointer: (event: React.PointerEvent<HTMLElement> | React.MouseEvent<HTMLElement>) => void;
  videoTrackVisible: boolean;
  setVideoTrackVisible: Dispatch<SetStateAction<boolean>>;
  videoTrackLocked: boolean;
  setVideoTrackLocked: Dispatch<SetStateAction<boolean>>;
  videoTrackSync: boolean;
  setVideoTrackSync: Dispatch<SetStateAction<boolean>>;
  videoThumbnails: string[];
  videoFile: File | null;
  videoDuration: number;
  timelineMarkers: number[];
  setTimelineMarkers: Dispatch<SetStateAction<number[]>>;
  audioTrackSolo: boolean;
  setAudioTrackSolo: Dispatch<SetStateAction<boolean>>;
  timelineMuted: boolean;
  setTimelineMuted: Dispatch<SetStateAction<boolean>>;
  audioTrackLocked: boolean;
  setAudioTrackLocked: Dispatch<SetStateAction<boolean>>;
  audioTrackSync: boolean;
  setAudioTrackSync: Dispatch<SetStateAction<boolean>>;
  audioWaveform: number[];
  setIsMuted: Dispatch<SetStateAction<boolean>>;
  videoRef: RefObject<HTMLVideoElement | null>;
  subtitleTrackVisible: boolean;
  setSubtitleTrackVisible: Dispatch<SetStateAction<boolean>>;
  subtitleTrackLocked: boolean;
  setSubtitleTrackLocked: Dispatch<SetStateAction<boolean>>;
  subtitleSegments: SubtitleSegment[];
  translatedFile: File | null;
  seekVideo: (time: number) => void;
  dubbedTrackSolo: boolean;
  setDubbedTrackSolo: Dispatch<SetStateAction<boolean>>;
  dubbedTrackMuted: boolean;
  setDubbedTrackMuted: Dispatch<SetStateAction<boolean>>;
  dubbedTrackLocked: boolean;
  setDubbedTrackLocked: Dispatch<SetStateAction<boolean>>;
  dubbedTrackSync: boolean;
  setDubbedTrackSync: Dispatch<SetStateAction<boolean>>;
  pipelineDone: boolean;
  ttsGeneration: TtsGenerationResult | null;
  videoCurrentTime: number;
  isVideoPlaying: boolean;
  timelineContextMenu: { x: number; y: number; time: number } | null;
  setTimelineContextMenu: Dispatch<SetStateAction<{ x: number; y: number; time: number } | null>>;
}

export function Timeline(props: TimelineProps) {
  const {
    t, openTimelineMenu, timelineScrollRef, timelineZoom, setTimelineZoom,
    timelineRulerDuration, timelineScrubbing, setTimelineScrubbing,
    seekFromTimelineRulerPointer, endTimelineScrub, startTimelineScrub,
    moveTimelineScrub, seekFromTimelinePointer, videoTrackVisible, setVideoTrackVisible,
    videoTrackLocked, setVideoTrackLocked, videoTrackSync, setVideoTrackSync,
    videoThumbnails, videoFile, videoDuration, timelineMarkers, setTimelineMarkers,
    audioTrackSolo, setAudioTrackSolo, timelineMuted, setTimelineMuted,
    audioTrackLocked, setAudioTrackLocked, audioTrackSync, setAudioTrackSync,
    audioWaveform, setIsMuted, videoRef, subtitleTrackVisible, setSubtitleTrackVisible,
    subtitleTrackLocked, setSubtitleTrackLocked, subtitleSegments, translatedFile,
    seekVideo, dubbedTrackSolo, setDubbedTrackSolo, dubbedTrackMuted, setDubbedTrackMuted, dubbedTrackLocked,
    setDubbedTrackLocked, dubbedTrackSync, setDubbedTrackSync, pipelineDone, ttsGeneration,
    videoCurrentTime, isVideoPlaying, timelineContextMenu, setTimelineContextMenu,
  } = props;

  return (
      <div className="rdvd-timeline" tabIndex={0} onContextMenu={openTimelineMenu}>
        <div className="rdvd-timeline-scroll" ref={timelineScrollRef}>
          <div
            className="rdvd-timeline-canvas"
            style={{
              width: `${Math.max(100, 100 * timelineZoom)}%`,
              // Child tracks live inside the post-label timeline track, while the
              // playhead/marker overlay lives on the full canvas. Keep separate
              // widths so both coordinate systems land on the same time position.
              ['--timeline-clip-width' as string]: timelineZoom < 1
                ? `${timelineZoom * 100}%`
                : '100%',
              ['--timeline-overlay-width' as string]: timelineZoom < 1
                ? `calc((100% - 86px) * ${timelineZoom})`
                : 'calc(100% - 86px)',
            }}
          >
            <div className="rdvd-ruler">
              <div className="timeline-ruler-head">
                <div className="timeline-ruler-label">{t.time}</div>
              </div>
              <div className="timeline-ruler-scale" onPointerDown={(event) => {
                if (event.pointerType === 'mouse' && event.button !== 0) return;
                event.preventDefault();
                seekFromTimelineRulerPointer(event);
                setTimelineScrubbing(true);
                try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* best effort */ }
              }} onPointerMove={(event) => {
                if (!timelineScrubbing) return;
                seekFromTimelineRulerPointer(event);
              }} onPointerUp={endTimelineScrub} onPointerCancel={endTimelineScrub}>
                {Array.from({ length: Math.max(2, Math.ceil(timelineRulerDuration / 10) + 1) }, (_, index) => {
                  const tickTime = Math.min(timelineRulerDuration, index * 10);
                  const tickPercent = timelineRulerDuration > 0 ? (tickTime / timelineRulerDuration) * 100 : 0;
                  return <span key={index} style={{ left: `${tickPercent}%` }}>{formatTimecode(tickTime)}</span>;
                })}
              </div>
            </div>
    
            <TimelineRow label="V1" trackName={t.video} kind="video" controls={
              <>
                <button type="button" className={videoTrackVisible ? 'track-control active track-eye' : 'track-control track-eye off'} title={videoTrackVisible ? t.hideVideoTrack : t.showVideoTrack} onPointerDown={(e) => e.stopPropagation()} onClick={() => setVideoTrackVisible((v) => !v)} aria-label={videoTrackVisible ? t.hideVideoTrack : t.showVideoTrack}>{videoTrackVisible ? '◉' : '◌'}</button>
                <button type="button" className={videoTrackLocked ? 'track-control active' : 'track-control'} title={videoTrackLocked ? t.unlockTrack : t.lockTrack} onPointerDown={(e) => e.stopPropagation()} onClick={() => setVideoTrackLocked((v) => !v)}>{videoTrackLocked ? '▣' : '□'}</button>
                <button type="button" className={videoTrackSync ? 'track-control active' : 'track-control'} title={t.syncLock} onPointerDown={(e) => e.stopPropagation()} onClick={() => setVideoTrackSync((v) => !v)}>↕</button>
              </>
            }>
              <div className={`timeline-clip timeline-video-strip${!videoTrackVisible ? ' track-disabled' : ''}`} style={{ width: 'var(--timeline-clip-width)' }} onPointerDown={startTimelineScrub} onPointerMove={moveTimelineScrub} onPointerUp={endTimelineScrub} onPointerCancel={endTimelineScrub} onDoubleClick={seekFromTimelinePointer} onContextMenu={openTimelineMenu}>
                {videoThumbnails.length ? videoThumbnails.map((src, index) => <img key={`${src}-${index}`} src={src} alt="" draggable={false} />) : <div className="timeline-empty">{videoFile ? t.analyzingVideo : t.noVideo}</div>}
                {timelineMarkers.map((marker) => <span className="timeline-marker" key={marker} style={{ left: `${videoDuration ? (marker / videoDuration) * 100 : 0}%` }} title={`${t.markerAt} ${formatTimecode(marker)}`} />)}
              </div>
            </TimelineRow>
    
            <TimelineRow label="A1" trackName={t.originalAudio} kind="audio" controls={
              <>
                <button type="button" className={audioTrackSolo ? 'track-control active solo' : 'track-control'} title={t.soloTrack} onPointerDown={(e) => e.stopPropagation()} onClick={() => setAudioTrackSolo((v) => !v)}>S</button>
                <button type="button" className={timelineMuted ? 'track-control active mute' : 'track-control'} title={timelineMuted ? t.unmuteTrack : t.muteTrack} onPointerDown={(e) => e.stopPropagation()} onClick={() => setTimelineMuted((m) => { const next = !m; setIsMuted(next); if (videoRef.current) videoRef.current.muted = next; return next; })}>M</button>
                <button type="button" className={audioTrackLocked ? 'track-control active' : 'track-control'} title={audioTrackLocked ? 'Mở khóa track' : 'Khóa track'} onPointerDown={(e) => e.stopPropagation()} onClick={() => setAudioTrackLocked((v) => !v)}>{audioTrackLocked ? '▣' : '□'}</button>
                <button type="button" className={audioTrackSync ? 'track-control active' : 'track-control'} title={t.syncLock} onPointerDown={(e) => e.stopPropagation()} onClick={() => setAudioTrackSync((v) => !v)}>↕</button>
              </>
            }>
              <div className={`timeline-clip real-waveform${timelineMuted ? ' muted' : ''}${isVideoPlaying ? ' playing' : ''}`} style={{ width: 'var(--timeline-clip-width)' }} onPointerDown={startTimelineScrub} onPointerMove={moveTimelineScrub} onPointerUp={endTimelineScrub} onPointerCancel={endTimelineScrub} onContextMenu={openTimelineMenu}>
                {audioWaveform.length ? audioWaveform.map((height, index) => (
                  <i
                    key={index}
                    className={`wave-bar wave-bar-${index % 5} ${height > 0.72 ? 'wave-high' : height > 0.42 ? 'wave-mid' : 'wave-low'}`}
                    style={{
                      height: `${Math.max(8, height * 100)}%`,
                      animationDelay: `${(index % 7) * 45}ms`,
                    }}
                  />
                )) : <div className="timeline-empty">{videoFile ? t.analyzingAudio : t.noVideo}</div>}
              </div>
            </TimelineRow>
    
            <TimelineRow label="S1" trackName={t.targetSubtitle} kind="subtitle" controls={
              <>
                <button type="button" className={subtitleTrackVisible ? 'track-control active track-eye' : 'track-control track-eye off'} title={subtitleTrackVisible ? t.hideSubtitle : t.showSubtitle} onPointerDown={(e) => e.stopPropagation()} onClick={() => setSubtitleTrackVisible((v) => !v)} aria-label={subtitleTrackVisible ? t.hideSubtitle : t.showSubtitle}>{subtitleTrackVisible ? '◉' : '◌'}</button>
                <button type="button" className={subtitleTrackLocked ? 'track-control active' : 'track-control'} title={subtitleTrackLocked ? t.unlockTrack : t.lockTrack} onPointerDown={(e) => e.stopPropagation()} onClick={() => setSubtitleTrackLocked((v) => !v)}>{subtitleTrackLocked ? '▣' : '□'}</button>
              </>
            }>
              <div className={`timeline-clip subtitle-track${!subtitleTrackVisible ? ' track-disabled' : ''}${subtitleSegments.length ? '' : ' empty-track'}`} style={{ width: 'var(--timeline-clip-width)' }} onPointerDown={startTimelineScrub} onPointerMove={moveTimelineScrub} onPointerUp={endTimelineScrub} onPointerCancel={endTimelineScrub} onContextMenu={openTimelineMenu}>
                {subtitleSegments.length ? subtitleSegments.map((segment, index) => {
                  const start = Math.max(0, Number(segment.start) || 0);
                  const end = Math.max(start, Number(segment.end) || start);
                  const left = videoDuration ? Math.min(100, (start / videoDuration) * 100) : 0;
                  const width = videoDuration ? Math.max(0, Math.min(100 - left, ((end - start) / videoDuration) * 100)) : 0;
                  return <button type="button" className="subtitle-clip-block" key={`${segment.start}-${segment.end}-${index}`} style={{ left: `${left}%`, width: `${width}%` }} onClick={(event) => { event.stopPropagation(); seekVideo(segment.start); }} title={`${formatTimecode(segment.start)} → ${formatTimecode(segment.end)} · ${segment.text}`}>{segment.text || '…'}</button>;
                }) : <div className="timeline-empty">{translatedFile ? t.noDialogue : t.targetSubtitle}</div>}
              </div>
            </TimelineRow>
    
            <TimelineRow label="A2" trackName={t.dubbedAudio} kind="audio" controls={
              <>
                <button type="button" className={dubbedTrackSolo ? 'track-control active solo' : 'track-control'} title={t.soloTrack} onPointerDown={(e) => e.stopPropagation()} onClick={() => setDubbedTrackSolo((v) => !v)}>S</button>
                <button type="button" className={dubbedTrackMuted ? 'track-control active mute' : 'track-control'} title={dubbedTrackMuted ? t.unmuteTrack : t.muteTrack} onPointerDown={(e) => e.stopPropagation()} onClick={() => setDubbedTrackMuted((value) => !value)}>M</button>
                <button type="button" className={dubbedTrackLocked ? 'track-control active' : 'track-control'} title={dubbedTrackLocked ? 'Mở khóa track' : 'Khóa track'} onPointerDown={(e) => e.stopPropagation()} onClick={() => setDubbedTrackLocked((v) => !v)}>{dubbedTrackLocked ? '▣' : '□'}</button>
                <button type="button" className={dubbedTrackSync ? 'track-control active' : 'track-control'} title={t.syncLock} onPointerDown={(e) => e.stopPropagation()} onClick={() => setDubbedTrackSync((v) => !v)}>↕</button>
              </>
            }>
              <div className={`timeline-clip dubbed-track${ttsGeneration ? '' : ' empty-track'}${dubbedTrackMuted ? ' muted' : ''}`} style={{ width: 'var(--timeline-clip-width)' }} onPointerDown={startTimelineScrub} onPointerMove={moveTimelineScrub} onPointerUp={endTimelineScrub} onPointerCancel={endTimelineScrub} onContextMenu={openTimelineMenu}>
                {ttsGeneration?.cues?.length
                  ? <>{ttsGeneration.cues.map((cue, index) => {
                      const start = Math.max(0, Number(cue.startMs) || 0) / 1000;
                      const end = Math.max(start, Number(cue.endMs) || cue.startMs) / 1000;
                      const left = videoDuration ? Math.min(100, (start / videoDuration) * 100) : 0;
                      const width = videoDuration ? Math.max(0, Math.min(100 - left, ((end - start) / videoDuration) * 100)) : 0;
                      return <button key={`${cue.segmentId}-${index}`} type="button" className="dubbed-audio-cue" style={{ left: `${left}%`, width: `${width}%` }} onClick={(event) => { event.stopPropagation(); seekVideo(cue.startMs / 1000); }} title={`${formatTimecode(cue.startMs / 1000)} → ${formatTimecode(cue.endMs / 1000)} · ${cue.text}`}>{cue.segmentId}</button>;
                    })}</>
                  : ttsGeneration
                    ? <span title={ttsGeneration.outputPath}>✓ {ttsGeneration.voiceName} · {ttsGeneration.outputPath.split(/[\\/]/).pop()} · {ttsGeneration.aligned ? 'aligned' : 'legacy'}</span>
                    : pipelineDone
                      ? <span>✓ {t.tts} · {t.subtitleStep}</span>
                      : <div className="timeline-empty">{t.noDubbedAudio}</div>}
              </div>
            </TimelineRow>
    
            <div className="timeline-media-overlay">
              <div className="timeline-marker-layer">{timelineMarkers.map((marker) => <button key={`m-${marker}`} type="button" className="timeline-marker-pin" style={{ left: `${videoDuration ? (marker / videoDuration) * 100 : 0}%` }} onClick={() => seekVideo(marker)} title={`${t.markerAt} ${formatTimecode(marker)}`}>◆</button>)}</div>
              <div className="playhead" style={{ left: videoDuration ? `${(Math.min(1, videoCurrentTime / videoDuration) * 100).toFixed(4)}%` : '0%' }} />
            </div>
          </div>
        </div>
        <div className="timeline-ruler-tools-fixed" role="group" aria-label={t.timelineZoomLabel}>
          <button type="button" title={t.zoomOutTimeline} onPointerDown={(e) => e.stopPropagation()} onClick={() => setTimelineZoom((z) => Math.max(.5, Number((z - .25).toFixed(2))))}>−</button>
          <input className="timeline-zoom-range" aria-label={t.timelineZoomLabel} title={t.timelineZoomLabel} type="range" min="0.5" max="4" step="0.05" value={timelineZoom} onPointerDown={(e) => e.stopPropagation()} onChange={(e) => setTimelineZoom(Number(e.target.value))} />
          <span>{Math.round(timelineZoom * 100)}%</span>
          <button type="button" title={t.zoomInTimeline} onPointerDown={(e) => e.stopPropagation()} onClick={() => setTimelineZoom((z) => Math.min(4, Number((z + .25).toFixed(2))))}>＋</button>
          <button type="button" title={t.fitTimeline} onPointerDown={(e) => e.stopPropagation()} onClick={() => setTimelineZoom(1)}>Fit</button>
        </div>
        {timelineContextMenu && (
          <div className="timeline-context-menu" style={{ left: Math.min(timelineContextMenu.x, window.innerWidth - 240), top: Math.min(timelineContextMenu.y, window.innerHeight - 260) }} onPointerDown={(e) => e.stopPropagation()}>
            <div className="context-time">{t.timeline} · {formatTimecode(timelineContextMenu.time)}</div>
            <button type="button" onClick={() => { seekVideo(timelineContextMenu.time); setTimelineContextMenu(null); }}>{`● ${t.seekHere}`}</button>
            <button type="button" onClick={() => { setTimelineMarkers((items) => items.some((v) => Math.abs(v - timelineContextMenu.time) < .25) ? items : [...items, timelineContextMenu.time].sort((a,b) => a-b)); setTimelineContextMenu(null); }}>{`◆ ${t.addMarker}`}</button>
            <button type="button" onClick={() => { setTimelineMarkers((items) => items.filter((v) => Math.abs(v - timelineContextMenu.time) >= .25)); setTimelineContextMenu(null); }}>{`◇ ${t.deleteMarker}`}</button>
            <button type="button" onClick={() => { setTimelineMuted((m) => { const next = !m; setIsMuted(next); if (videoRef.current) videoRef.current.muted = next; return next; }); setTimelineContextMenu(null); }}>{timelineMuted ? `🔊 ${t.unmuteOriginal}` : `🔇 ${t.muteOriginal}`}</button>
            <button type="button" onClick={() => { setVideoTrackVisible((v) => !v); setTimelineContextMenu(null); }}>{videoTrackVisible ? `◉ ${t.hideVideoTrack}` : `○ ${t.showVideoTrack}`}</button>
            <button type="button" onClick={() => { setTimelineZoom(1); setTimelineContextMenu(null); }}>{`⌗ ${t.fitTimeline}`}</button>
            <button type="button" className="danger" onClick={() => { setTimelineMarkers([]); setTimelineContextMenu(null); }}>{`× ${t.deleteAllMarkers}`}</button>
          </div>
        )}
      </div>
  );
}

function TimelineRow({ label, trackName, kind, controls, children }: { label: string; trackName: string; kind: 'video' | 'audio' | 'subtitle'; controls: React.ReactNode; children: React.ReactNode }) {
  return <div className={`timeline-row ${kind === 'video' ? 'video-row' : kind === 'subtitle' ? 'subtitle-row' : 'audio-row'}`}><div className="timeline-label"><strong>{label}</strong><span className="track-name">{trackName}</span><div className="track-controls">{controls}</div></div><div className="timeline-track">{children}</div></div>;
}
