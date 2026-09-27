AI RDvD UI V13

Subtitle selector fix:
- Drag element now owns the actual width/height, so the eight handles are positioned against a real box.
- Left/right/top/bottom handles all resize independently.
- Resize is clamped to the 1920x1080 stage edges so the active handle does not disappear outside the preview.
- Only minimum size is enforced; there is no fixed max-width/max-height.
- No CSS transition is applied during resize.
- Handles retain a small visible 6px dot with a larger invisible hitbox.
