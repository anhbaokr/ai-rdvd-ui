AI RDvD UI V11 — Subtitle Drag/Resize Stability

V11 replaces per-frame React state updates during drag with direct DOM updates inside requestAnimationFrame.
React state is committed once at the end of the pointer session, while a lightweight 50ms preview state updates the X/Y inputs.
Pointer capture is attached to the outer subtitle selector instead of nested resize buttons.
Resize direction is identified from data-handle, removing nested pointer handlers that could compete.

Files changed for this fix:
- src/AIRDvD.tsx
- src/ai-rdvd.css
