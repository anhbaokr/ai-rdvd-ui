import { useEffect, useRef, useState } from 'react';
import type { SubtitleSegment } from '../types';
import { parseSubtitleFile } from '../utils/subtitle';

export function useMediaProject() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
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
    if (!translatedFile) {
      setSubtitleSegments([]);
      return;
    }
    let cancelled = false;
    translatedFile.text().then((content) => {
      if (!cancelled) setSubtitleSegments(parseSubtitleFile(content, videoDuration));
    }).catch(() => {
      if (!cancelled) setSubtitleSegments([]);
    });
    return () => { cancelled = true; };
  }, [translatedFile, videoDuration]);

  useEffect(() => {
    if (!videoUrl) {
      setVideoThumbnails([]);
      setAudioWaveform([]);
      return;
    }

    let cancelled = false;
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'auto';
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.src = videoUrl;

    const buildMediaTimeline = async () => {
      try {
        await new Promise<void>((resolve, reject) => {
          tempVideo.onloadedmetadata = () => resolve();
          tempVideo.onerror = () => reject(new Error('Không đọc được metadata video'));
          tempVideo.load();
        });
        if (cancelled) return;

        const duration = Number.isFinite(tempVideo.duration) ? tempVideo.duration : 0;
        const count = Math.min(12, Math.max(6, Math.ceil(duration / 8) || 6));
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext('2d');
        const thumbs: string[] = [];
        if (ctx && duration > 0) {
          for (let i = 0; i < count; i += 1) {
            const time = Math.min(duration - 0.05, (duration * i) / Math.max(1, count - 1));
            await new Promise<void>((resolve) => {
              const done = () => { tempVideo.removeEventListener('seeked', done); resolve(); };
              tempVideo.addEventListener('seeked', done, { once: true });
              tempVideo.currentTime = Math.max(0, time);
            });
            if (cancelled) return;
            ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
            thumbs.push(canvas.toDataURL('image/jpeg', 0.72));
          }
        }
        if (!cancelled) setVideoThumbnails(thumbs);

        try {
          const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
          if (!AudioContextCtor) return;
          const response = await fetch(videoUrl);
          const buffer = await response.arrayBuffer();
          const audioContext = new AudioContextCtor();
          const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
          const channel = audioBuffer.getChannelData(0);
          const points = 180;
          const step = Math.max(1, Math.floor(channel.length / points));
          const waveform: number[] = [];
          for (let i = 0; i < points; i += 1) {
            const start = i * step;
            const end = Math.min(channel.length, start + step);
            let peak = 0;
            for (let j = start; j < end; j += Math.max(1, Math.floor(step / 24))) peak = Math.max(peak, Math.abs(channel[j]));
            waveform.push(Math.min(1, peak));
          }
          if (!cancelled) setAudioWaveform(waveform);
          await audioContext.close();
        } catch {
          if (!cancelled) setAudioWaveform([]);
        }
      } catch {
        if (!cancelled) {
          setVideoThumbnails([]);
          setAudioWaveform([]);
        }
      }
    };

    void buildMediaTimeline();
    return () => {
      cancelled = true;
      tempVideo.removeAttribute('src');
      tempVideo.load();
    };
  }, [videoUrl]);

  return {
    videoFile, setVideoFile, videoUrl, setVideoUrl,
    isVideoPlaying, setIsVideoPlaying, videoCurrentTime, setVideoCurrentTime,
    videoDuration, setVideoDuration, videoThumbnails, setVideoThumbnails,
    audioWaveform, setAudioWaveform, dialogueFile, setDialogueFile,
    translatedFile, setTranslatedFile, subtitleSegments, setSubtitleSegments,
    videoInputRef, videoRef, dialogueInputRef, translatedInputRef,
  };
}
