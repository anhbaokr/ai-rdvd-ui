# AI RDvD UI V43 — SHRINK-SAFE TIMELINE

V43 corrects the remaining Timeline overflow when the application window is
made shorter or narrower.

## Root cause

V42 reserved a 165–177 px Timeline band, while the inner canvas still required
24 px for the ruler plus four tracks of at least 34 px. Scrollbars, borders and
WebView rounding could reduce the usable height below that intrinsic 160 px,
which pushed the final track below the visible area.

## Fixes

- Timeline rows divide the actual available height instead of forcing a 34 px
  minimum per track.
- Canvas, rows, tracks and clips can shrink without intrinsic-content overflow.
- Very short desktop windows use a clamped Timeline height and 48 px top bar.
- At 900 px wide and below, Preview, Edit Video and Timeline use separate stacked
  rows, preventing overlap.
- Timeline zoom keeps horizontal scrolling without vertical clipping.

All V42 Timeline controls and tracks (V1, A1, S1 and A2) are preserved.
