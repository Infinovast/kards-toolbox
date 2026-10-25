## Why

The project is currently a browser-hosted KARDS deck manager, which makes local data, image assets, and the deck-image proxy depend on a web runtime and a manually started Node server. Converting it into a Windows desktop application gives players a launchable, offline-first tool with predictable local storage, packaged assets, and a cleaner distribution path.

## What Changes

- Add a Windows desktop application shell for the existing React/Vite UI, including a native window, application metadata, and production startup behavior that does not require users to run a terminal.
- Preserve the current offline-first deck, collection, tablecloth, card-back, settings, and cached deck-image data while introducing a desktop-owned storage and migration boundary.
- Keep the deck-image generation proxy private to the desktop app process so remote service URLs and API keys are not exposed to the renderer.
- Add Windows build, install, and smoke-test workflows for a development test version and future distributable packages.
- Update configuration so the app can run in development with hot reload and in production from packaged assets.

## Capabilities

### New Capabilities

- `windows-desktop-shell`: Defines how the app launches, owns its native Windows window, loads the existing UI, and exposes only safe desktop APIs to the renderer.
- `desktop-data-storage`: Defines persistence, migration, import/export, and backup expectations for deck data and user-provided image assets in a desktop environment.
- `windows-packaging`: Defines Windows build outputs, application metadata, install behavior, and verification requirements for a development test build.

### Modified Capabilities

- None.

## Impact

- Affected frontend code: `src/App.tsx`, `src/main.tsx`, `src/lib/*`, and any new renderer preload/client adapters needed for desktop APIs.
- Affected backend/runtime code: `server.ts` or its desktop replacement, especially `/api/deck-image` and environment-based secret handling.
- New dependencies are expected for the desktop runtime and Windows packaging, with Electron favored unless a smaller Tauri/Rust toolchain is explicitly selected later.
- Build scripts in `package.json`, Vite configuration, and TypeScript configuration will need updates for desktop development, production packaging, and smoke verification.
- Local user data will need a clear storage location under the Windows user profile, plus migration from existing browser IndexedDB/localStorage where feasible.
