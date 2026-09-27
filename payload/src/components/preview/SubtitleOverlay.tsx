import type { CSSProperties, PointerEventHandler, RefObject } from 'react';
import { HANDLES } from '../../constants/editor';
import type { UiText } from '../../types';
import { hexToRgba } from '../../utils/color';

interface SubtitleOverlayProps {
  t: UiText;
  dragging: boolean;
  hasDialogue: boolean;
  subtitleVisible: boolean;
  subtitleDragStyle: CSSProperties;
  subtitleColor: string;
  subtitleBg: string;
  subtitleOpacity: number;
  subtitleSize: number;
  subtitleFont: string;
  subtitleOutline: boolean;
  subtitleOutlineWidth: number;
  subtitleText: string;
  selected: boolean;
  dragElementRef: RefObject<HTMLDivElement | null>;
  subtitleBoxRef: RefObject<HTMLDivElement | null>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerEnd: PointerEventHandler<HTMLDivElement>;
}

export function SubtitleOverlay(props: SubtitleOverlayProps) {
  const {
    t, dragging, hasDialogue, subtitleVisible, subtitleDragStyle, subtitleColor,
    subtitleBg, subtitleOpacity, subtitleSize, subtitleFont, subtitleOutline,
    subtitleOutlineWidth, subtitleText, selected, dragElementRef, subtitleBoxRef, onPointerDown,
    onPointerMove, onPointerEnd,
  } = props;

  return <div
    ref={dragElementRef}
    className={`rdvd-subtitle-drag${dragging ? ' dragging' : ''}${selected ? ' selected' : ''}${hasDialogue ? '' : ' placeholder-only'}`}
    style={subtitleDragStyle}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerEnd}
    onPointerCancel={onPointerEnd}
    onLostPointerCapture={onPointerEnd}
    role="group"
    aria-label={t.subtitleFrame}
    title={t.dragHint}
  >
    <div
      ref={subtitleBoxRef}
      className="rdvd-subtitle-box"
      style={{ background: hexToRgba(subtitleBg, 1 - subtitleOpacity / 100) }}
      aria-hidden={!subtitleVisible}
    >
      {HANDLES.map((handle) => <button key={handle} type="button" className={`subtitle-handle handle-${handle}`} data-handle={handle} aria-label={`${t.resizeHandle} ${handle}`} />)}
      <div className={`rdvd-subtitle${subtitleVisible ? '' : ' subtitle-layer-hidden'}`} style={{
        color: subtitleColor,
        fontSize: `${Math.max(15, Math.min(36, subtitleSize * 0.45))}px`,
        fontFamily: subtitleFont,
        WebkitTextStroke: subtitleOutline ? `${Math.max(0, subtitleOutlineWidth * 0.5)}px #000` : '0 transparent',
      }}>
        {subtitleText}
      </div>
    </div>
  </div>;
}
