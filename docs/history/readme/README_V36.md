# AI RDvD — V36

## Preview uses the real imported video

- Removed the default `poster` from the `<video>` element when a real video is imported.
- The preview renders the imported object URL directly.
- The default generated preview image is shown only when no video has been imported.
- A changing video URL forces the preview element to remount so a newly imported file cannot leave the previous/default poster visible.
- `preload="auto"` is used for the real imported video preview.
- Preview errors are written to Live Log in the active UI language.

This prevents the old `public/preview.png` image (which contains sample subtitle text) from appearing after a real video has been imported.
