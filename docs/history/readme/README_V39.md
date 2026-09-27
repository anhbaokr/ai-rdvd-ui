# AI RDvD UI — V39

## Tauri/Vite dev stability fix

- Vite no longer watches `src-tauri/**`, preventing `EBUSY` watcher collisions while Cargo/Rust writes files under `src-tauri/target`.
- Vite uses `strictPort: true` so a second Vite instance cannot silently move from 5177 to 5178 while Tauri still expects 5177.

### Clean desktop dev run

Stop any existing Vite/Tauri dev process, then run only:

```cmd
cd /d E:\ai-rdvd-ui
npx tauri dev
```
