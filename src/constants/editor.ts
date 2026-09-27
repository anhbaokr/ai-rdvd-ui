import type { SelectionHandle } from '../types';

export const STAGE_W = 1920;
export const STAGE_H = 1080;
export const MIN_W = 40;
export const MIN_H = 24;

export const HANDLES: SelectionHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

export const CURSOR_BY_HANDLE: Record<SelectionHandle, string> = {
  nw: 'nwse-resize',
  n: 'ns-resize',
  ne: 'nesw-resize',
  e: 'ew-resize',
  se: 'nwse-resize',
  s: 'ns-resize',
  sw: 'nesw-resize',
  w: 'ew-resize',
};
