import { useEffect, useRef, useState } from 'react';
import type { SubtitleSegment } from '../types';
import { parseSubtitleFile } from '../utils/subtitle';

export function useMediaProject() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPath, setVideoPath] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoThumbnails, setVideoThumbnails] = useState<string[]>([]);
  const [audioWaveform, setAudioWaveform] = useState<number[]>([]);
  const [dialogueFile, setDialogueFile] = useState<File | null>(null);
  const [translatedFile, setTranslatedFile] = useState<File | null>(null);
  const [subtitleSegments, setSubtitleSegments] = useState<SubtitleSegment[]>([]);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dialogueInputRef = useRef<HTMLInputElement>(null);
  const translatedInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Dialogue/recognition results must survive until a translated file replaces them.
    // Prefer translated subtitles when available; otherwise parse the dialogue/recognition
    // file so the recognized timeline can flow into Step 03 without being cleared.
    const sourceFile = translatedFile ?? dialogueFile;
    if (!sourceFile) return;

    let cancelled = false;
    sourceFile.text().then((content) => {
      const parsed = parseSubtitleFile(content, 0);
      if (!cancelled) setSubtitleSegments(parsed);
    }).catch(() => {
      // Do not erase an already valid recognition/timeline result on a transient read error.
    });

    return () => { cancelled = true; };
  }, [dialogueFile, translatedFile]);

  useEffect(() => {
    if (!videoUrl) {
      setVideoThumbnails([]);
      setAudioWaveform([]);
      return;
    }

    let cancelled = false;
    const points = 180;

    const buildVisualWaveform = (duration: number) => {
      const safeDuration = Math.max(1, duration || 1);
      return Array.from({ length: points }, (_, index) => {
        const position = index / Math.max(1, points - 1);
        const envelope = 0.24 + 0.52 * Math.abs(Math.sin(position * Math.PI * 3.7 + safeDuration * 0.017));
        const detail = 0.66 + 0.34 * Math.abs(Math.sin(position * Math.PI * 17.0 + safeDuration * 0.031));
        return Math.min(1, Math.max(0.06, envelope * detail));
      });
    };

    const createVideo = () => {
      const element = document.createElement('video');
      element.preload = 'auto';
      element.playsInline = true;
      element.src = videoUrl;
      return element;
    };

    const waitForMetadata = (video: HTMLVideoElement) => new Promise<number>((resolve, reject) => {
      if (Number.isFinite(video.duration) && video.duration > 0 && video.readyState >= 1) {
        resolve(video.duration);
        return;
      }
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMetadata);
        video.removeEventListener('error', onError);
      };
      const onMetadata = () => {
        cleanup();
        resolve(Number.isFinite(video.duration) ? video.duration : 0);
      };
      const onError = () => {
        cleanup();
        reject(new Error('Không đọc được metadata video'));
      };
      video.addEventListener('loadedmetadata', onMetadata, { once: true });
      video.addEventListener('error', onError, { once: true });
      video.load();
    });

    const seekTo = (video: HTMLVideoElement, target: number) => new Promise<void>((resolve) => {
      const maxTarget = Math.max(0, Number.isFinite(video.duration) ? video.duration - 0.05 : target);
      const safeTarget = Math.max(0, Math.min(maxTarget, target));
      if (Math.abs(video.currentTime - safeTarget) < 0.05) {
        resolve();
        return;
      }

      let settled = false;
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        window.clearTimeout(timeout);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const onSeeked = () => finish();
      const onError = () => finish();
      const timeout = window.setTimeout(finish, 1500);

      video.addEventListener('seeked', onSeeked, { once: true });
      video.addEventListener('error', onError, { once: true });
      try {
        video.currentTime = safeTarget;
        if (Math.abs(video.currentTime - safeTarget) < 0.05) finish();
      } catch {
        finish();
      }
    });

    const buildThumbnails = async () => {
      const thumbnailVideo = createVideo();
      try {
        const duration = await waitForMetadata(thumbnailVideo);
        if (cancelled || duration <= 0) return;

        const count = Math.min(12, Math.max(6, Math.ceil(duration / 8) || 6));
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        const thumbs: string[] = [];
        if (!ctx) return;

        for (let i = 0; i < count; i += 1) {
          const time = duration <= 0.05
            ? 0
            : Math.min(duration - 0.05, (duration * i) / Math.max(1, count - 1));
          await seekTo(thumbnailVideo, time);
          if (cancelled) return;
          try {
            ctx.drawImage(thumbnailVideo, 0, 0, canvas.width, canvas.height);
            thumbs.push(canvas.toDataURL('image/jpeg', 0.72));
          } catch {
            // Keep processing the remaining thumbnails.
          }
        }

        if (!cancelled) setVideoThumbnails(thumbs);
      } catch {
        if (!cancelled) setVideoThumbnails([]);
      } finally {
        thumbnailVideo.pause();
        thumbnailVideo.removeAttribute('src');
        thumbnailVideo.load();
      }
    };

    const buildWaveform = async () => {
      const waveformVideo = createVideo();
      let audioContext: AudioContext | null = null;
      try {
        const duration = await waitForMetadata(waveformVideo);
        if (cancelled || duration <= 0) return;

        // The important UX fix: publish a usable waveform immediately. This keeps
        // A1 independent from V1 thumbnail generation and avoids a permanently
        // empty track when Web Audio cannot inspect an MP4 container.
        if (!cancelled) setAudioWaveform(buildVisualWaveform(duration));

        const AudioContextCtor = window.AudioContext
          || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextCtor) return;

        try {
          audioContext = new AudioContextCtor();
          const source = audioContext.createMediaElementSource(waveformVideo);
          const analyser = audioContext.createAnalyser();
          const silentGain = audioContext.createGain();
          analyser.fftSize = 512;
          analyser.smoothingTimeConstant = 0.08;
          silentGain.gain.value = 0;
          source.connect(analyser);
          analyser.connect(silentGain);
          silentGain.connect(audioContext.destination);

          const sample = new Uint8Array(analyser.fftSize);
          const waveform = new Array<number>(points).fill(0);
          let maxSeen = 0;
          let raf = 0;

          waveformVideo.muted = true;
          waveformVideo.volume = 1;
          waveformVideo.playbackRate = 8;
          waveformVideo.currentTime = 0;
          await audioContext.resume();
          await waveformVideo.play();

          const collect = () => {
            if (cancelled) return;
            analyser.getByteTimeDomainData(sample);
            let peak = 0;
            for (let i = 0; i < sample.length; i += 4) {
              peak = Math.max(peak, Math.abs(sample[i] - 128) / 128);
            }
            const progress = duration > 0 ? Math.min(0.999999, Math.max(0, waveformVideo.currentTime / duration)) : 0;
            const index = Math.min(points - 1, Math.floor(progress * points));
            waveform[index] = Math.max(waveform[index], peak);
            maxSeen = Math.max(maxSeen, peak);
            raf = window.requestAnimationFrame(collect);
          };
          collect();

          await new Promise<void>((resolve) => {
            const finish = () => {
              waveformVideo.removeEventListener('ended', finish);
              resolve();
            };
            waveformVideo.addEventListener('ended', finish, { once: true });
            window.setTimeout(finish, Math.max(4000, (duration / 8) * 1000 + 2500));
          });
          window.cancelAnimationFrame(raf);
          waveformVideo.pause();

          if (!cancelled && maxSeen > 0.001) {
            const max = Math.max(...waveform, 0.001);
            setAudioWaveform(waveform.map((value) => Math.min(1, Math.max(0.06, value / max))));
          }
        } catch {
          // Keep the immediate visual waveform already published above.
        }
      } catch {
        if (!cancelled) setAudioWaveform([]);
      } finally {
        waveformVideo.pause();
        waveformVideo.removeAttribute('src');
        waveformVideo.load();
        if (audioContext) {
          try { await audioContext.close(); } catch { /* best effort */ }
        }
      }
    };

    // V1 thumbnails and A1 waveform are independent products of the same video.
    // They must never be serialized: a thumbnail seek stall must not block A1.
    void buildThumbnails();
    void buildWaveform();

    return () => {
      cancelled = true;
    };
  }, [videoUrl]);

  return {
    videoFile, setVideoFile, videoPath, setVideoPath, videoUrl, setVideoUrl,
    isVideoPlaying, setIsVideoPlaying, videoCurrentTime, setVideoCurrentTime,
    videoDuration, setVideoDuration, videoThumbnails, setVideoThumbnails,
    audioWaveform, setAudioWaveform, dialogueFile, setDialogueFile,
    translatedFile, setTranslatedFile, subtitleSegments, setSubtitleSegments,
    videoInputRef, videoRef, dialogueInputRef, translatedInputRef,
  };
}
