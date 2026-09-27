import { useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEventHandler, RefObject } from 'react';
import { HANDLES } from '../../constants/editor';
import type { UiText } from '../../types';
import { hexToRgba } from '../../utils/color';

interface SubtitleOverlayProps {
  t: UiText;
  dragging: boolean;
  subtitleVisible: boolean;
  subtitleDragStyle: CSSProperties;
  subtitleColor: string;
  subtitleBg: string;
  subtitleOpacity: number;
  subtitleSize: number;
  subtitleOutline: boolean;
  subtitleOutlineWidth: number;
  subtitleText: string;
  dragElementRef: RefObject<HTMLDivElement | null>;
  subtitleBoxRef: RefObject<HTMLDivElement | null>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerEnd: PointerEventHandler<HTMLDivElement>;
}

export function SubtitleOverlay(props: SubtitleOverlayProps) {
  const {
    t, dragging, subtitleVisible, subtitleDragStyle, subtitleColor, subtitleBg,
    subtitleOpacity, subtitleSize, subtitleOutline,
    subtitleOutlineWidth, subtitleText, dragElementRef, subtitleBoxRef,
    onPointerDown, onPointerMove, onPointerEnd,
  } = props;

  const subtitleBackground = hexToRgba(subtitleBg, 1 - subtitleOpacity / 100);
  const subtitleTextRef = useRef<HTMLDivElement | null>(null);
  const [horizontalFit, setHorizontalFit] = useState(1);

  useLayoutEffect(() => {
    const textElement = subtitleTextRef.current;
    const boxElement = subtitleBoxRef.current;
    if (!textElement || !boxElement) return;

    const updateHorizontalFit = () => {
      const naturalWidth = Math.max(1, textElement.scrollWidth);
      const availableWidth = Math.max(1, boxElement.clientWidth * 0.94);
      setHorizontalFit(Math.min(0.9, availableWidth / naturalWidth));
    };

    updateHorizontalFit();
    const observer = new ResizeObserver(updateHorizontalFit);
    observer.observe(boxElement);
    void document.fonts?.ready.then(updateHorizontalFit);
    return () => observer.disconnect();
  }, [subtitleBoxRef, subtitleSize, subtitleText]);

  return (
    <div
      ref={dragElementRef}
      className={`rdvd-subtitle-drag${dragging ? ' dragging' : ''}`}
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
        style={{
          background: `linear-gradient(90deg, transparent 0%, ${subtitleBackground} 16%, ${subtitleBackground} 84%, transparent 100%)`,
        }}
      >
        {HANDLES.map((handle) => (
          <button
            key={handle}
            type="button"
            className={`subtitle-handle handle-${handle}`}
            data-handle={handle}
            aria-label={`${t.resizeHandle} ${handle}`}
          />
        ))}
        <div
          ref={subtitleTextRef}
          className={`rdvd-subtitle-text${subtitleVisible ? '' : ' subtitle-layer-hidden'}`}
          style={{
            color: subtitleColor,
            fontSize: `clamp(10px, ${Math.max(1, subtitleSize) / 19.2}cqw, 42px)`,
            WebkitTextStroke: subtitleOutline
              ? `clamp(1px, ${Math.max(0, subtitleOutlineWidth) / 19.2}cqw, ${Math.max(1, subtitleOutlineWidth)}px) #050505`
              : '0 transparent',
            transform: `scaleX(${horizontalFit}) skewX(-5deg)`,
          }}
        >
          {subtitleText || '\u00A0'}
        </div>
      </div>
    </div>
  );
}
