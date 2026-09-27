# AI RDvD V38 — Tauri Desktop Shell

V38 adds a Tauri 2 desktop shell around the existing V37 React/Vite UI.

## Development (browser)

```cmd
npm install
npm run dev
```

## Development (Tauri desktop)

```cmd
npm install
npm run tauri:dev
```

This opens the same UI inside a native Tauri window.

## Windows build

```cmd
npm run build
npm run tauri:build
```

For a Windows `.exe` installer only:

```cmd
npm run tauri:build:exe
```

The native window uses the existing custom title-bar buttons for minimize, maximize/restore, and close.
The app remains responsive in normal Vite browser mode; the Tauri window commands simply do nothing outside Tauri.

## Windows prerequisites

Tauri desktop builds require Rust, Microsoft C++ Build Tools, and WebView2 on Windows.
