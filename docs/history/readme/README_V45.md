# AI RDvD UI V45 — ARCHITECTURE REFACTOR

V45 restructures the V44 source without changing the established interface or
workflow.

## Runtime structure

```text
src/
├── components/
│   ├── editor/EditPanel.tsx
│   ├── preview/{VideoPreview,SubtitleOverlay,LogoOverlay}.tsx
│   ├── settings/SettingsDialog.tsx
│   ├── timeline/Timeline.tsx
│   ├── topbar/Topbar.tsx
│   └── workflow/WorkflowSidebar.tsx
├── hooks/{useMediaProject,usePipeline,useTimeline}.ts
├── constants/{editor,uiText}.ts
├── utils/{color,subtitle,timecode}.ts
├── styles/
│   ├── foundation.css
│   ├── preview.css
│   ├── timeline.css
│   ├── workflow.css
│   ├── interactions-theme.css
│   ├── media-timeline.css
│   ├── settings-timeline.css
│   ├── workspace-responsive.css
│   ├── responsive.css
│   └── index.css
├── AIRDvD.tsx
└── types.ts
```

## Compatibility contract

- Existing DOM class attributes are preserved exactly (221 before and after).
- Existing click, input, pointer, double-click and context-menu handlers remain.
- Language/theme menus and all localStorage keys remain unchanged.
- Video preview, subtitle/logo dragging, Timeline interactions and the simulated
  AI pipeline preserve their V44 behavior.
- Responsive Timeline fixes from V43 and menu positioning from V44 are retained.

## CSS consolidation

- The single historical stylesheet is replaced by ordered functional modules.
- 192 declarations that were shadowed by later rules for the same selector and
  property were removed.
- Remaining repeated selectors carry non-conflicting properties required by
  their functional modules or media-query context.
- Version-patch labels were removed; new styling belongs in the relevant module.

## Verification

`npm run build` passes under strict TypeScript and Vite production compilation.
