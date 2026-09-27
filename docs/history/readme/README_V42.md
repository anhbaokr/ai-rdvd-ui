# AI RDvD UI V42 — TRUE VIEWPORT-FIT LAYOUT

V42 fixes the desktop resize/overflow issue observed on 1366x768 and similar laptop windows.

## Layout contract
- App uses the actual WebView client area: `height: 100%`, `min-height: 0`, `overflow: hidden`.
- Workflow sidebar: ~25% width with independent vertical scrolling.
- Editor: ~75% width.
- Top editor row contains Preview + Edit Video.
- Timeline occupies a dedicated full-width lower row.
- Timeline has a reserved vertical band (177px default, reduced to 171/165px on short windows) so it never falls below the viewport.
- Preview/Edit Video consume the remaining height.

## Responsive behavior
- At <=740px viewport height: Timeline reserved band = 171px.
- At <=680px viewport height: Timeline reserved band = 165px.
- The timeline viewport itself scrolls internally for its content; the application window does not gain page-level vertical overflow.

## Preserved V41 behavior
- V1/A1/S1/A2 timeline tracks.
- Subtitle track and subtitle visibility/lock controls.
- Tauri desktop shell.
- Language/theme menus above the editor layers.
- Auto pipeline workflow contract.
- Existing video/player/editor interactions.
