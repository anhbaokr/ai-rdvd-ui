import type { PointerEventHandler, RefObject } from 'react';
import { HANDLES, STAGE_H, STAGE_W } from '../../constants/editor';
import type { BoxState, UiText } from '../../types';

interface LogoOverlayProps {
  t: UiText;
  logoUrl: string;
  logoFile: File | null;
  logoBox: BoxState;
  logoDragging: boolean;
  logoElementRef: RefObject<HTMLDivElement | null>;
  onPointerDown: PointerEventHandler<HTMLDivElement>;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerEnd: PointerEventHandler<HTMLDivElement>;
  removeLogo: () => void;
}

export function LogoOverlay(props: LogoOverlayProps) {
  const { t, logoUrl, logoFile, logoBox, logoDragging, logoElementRef, onPointerDown, onPointerMove, onPointerEnd, removeLogo } = props;
  return <div
    ref={logoElementRef}
    className={`rdvd-logo-drag${logoDragging ? ' dragging' : ''}`}
    style={{ left: `${(logoBox.x / STAGE_W) * 100}%`, top: `${(logoBox.y / STAGE_H) * 100}%`, width: `${(logoBox.w / STAGE_W) * 100}%`, height: `${(logoBox.h / STAGE_H) * 100}%` }}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={onPointerEnd}
    onPointerCancel={onPointerEnd}
    onLostPointerCapture={onPointerEnd}
    title={t.logoHint}
  >
    <img src={logoUrl} alt={logoFile?.name || t.logo} draggable={false} />
    <span className="rdvd-logo-tag">LOGO</span>
    {HANDLES.map((handle) => <button key={`logo-${handle}`} type="button" className={`subtitle-handle handle-${handle}`} data-logo-handle={handle} aria-label={`${t.resizeHandle} ${handle}`} />)}
    <button type="button" className="rdvd-logo-remove" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); removeLogo(); }} title={t.removeLogo}>×</button>
  </div>;
}
