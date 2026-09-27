import { useRef, useState } from 'react';

export function useTimeline() {
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [timelineMarkers, setTimelineMarkers] = useState<number[]>([]);
  const [timelineMuted, setTimelineMuted] = useState(false);
  const [videoTrackVisible, setVideoTrackVisible] = useState(true);
  const [videoTrackLocked, setVideoTrackLocked] = useState(false);
  const [videoTrackSync, setVideoTrackSync] = useState(true);
  const [audioTrackLocked, setAudioTrackLocked] = useState(false);
  const [audioTrackSolo, setAudioTrackSolo] = useState(false);
  const [audioTrackSync, setAudioTrackSync] = useState(true);
  const [dubbedTrackLocked, setDubbedTrackLocked] = useState(false);
  const [dubbedTrackSolo, setDubbedTrackSolo] = useState(false);
  const [dubbedTrackMuted, setDubbedTrackMuted] = useState(false);
  const [dubbedTrackSync, setDubbedTrackSync] = useState(true);
  const [subtitleTrackVisible, setSubtitleTrackVisible] = useState(true);
  const [subtitleTrackLocked, setSubtitleTrackLocked] = useState(false);
  const [timelineScrubbing, setTimelineScrubbing] = useState(false);
  const [timelineContextMenu, setTimelineContextMenu] = useState<{ x: number; y: number; time: number } | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  return {
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
  };
}
