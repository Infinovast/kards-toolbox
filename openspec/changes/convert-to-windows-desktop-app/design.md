## Context

The current application is a React 19 + Vite single-page app with a small Express server used for development serving and for the private `/api/deck-image` proxy. User data is stored through `localforage` in browser IndexedDB, including decks, collections, settings, custom tablecloths, custom card backs, and cached generated deck images. The app already behaves offline for core deck management, but users still need a browser and a manually started Node process.

The Windows version should preserve the existing UI and offline-first behavior while adding a native application process, packaged assets, desktop-safe storage boundaries, and a build path that can produce a development test installer or unpacked executable.

## Goals / Non-Goals

**Goals:**

- Produce a Windows desktop development test version that launches without a terminal.
- Reuse the existing React/Vite renderer and KARDS visual assets.
- Move sensitive deck-image proxy behavior out of the browser-facing renderer and into a trusted desktop process.
- Preserve existing offline data and define an explicit migration/import/export path.
- Add scripts and verification steps for development, production build, and Windows smoke testing.

**Non-Goals:**

- Redesign the KARDS deck manager UI.
- Add cloud sync, accounts, or multiplayer/shared collection features.
- Guarantee automatic migration from every external browser profile; migration is best-effort unless the user exports data from the web build.
- Ship notarized or Microsoft Store packaging in the first Windows development test version.

## Decisions

### Use Electron for the first Windows desktop version

Electron should be the first implementation target because the project already depends on Node-compatible tooling, Vite, React, and an Express-style proxy. The main process can own the app window, environment secrets, and deck-image network calls while the renderer stays close to the current browser implementation.

Alternatives considered:

- Tauri: smaller output and stronger native posture, but adds Rust setup and requires a larger bridge rewrite for the proxy and storage.
- WebView2-only wrapper: lighter on Windows, but less portable across future desktop targets and less aligned with the current Node-based proxy.

### Split renderer and desktop runtime responsibilities

The renderer should remain responsible for UI state, deck parsing, filters, cropping UI, and visual presentation. The Electron main/preload layer should own native window lifecycle, app metadata, secure IPC, packaged asset resolution, and deck-image proxy calls.

The preload script should expose a narrow `window.kardsDesktop` API with context isolation enabled and Node integration disabled. Renderer code should use a small client adapter: call the desktop API when present and fall back to `/api/deck-image` for the existing web development server.

### Keep localforage initially, but bind it to desktop data ownership

For the development test version, the existing `localforage` model can remain in the renderer because Electron stores IndexedDB inside the app's Windows user data directory rather than an arbitrary browser profile. The app should add explicit export/import and backup affordances so users can move data between web and desktop builds.

If later requirements demand larger assets, searchable deck history, or deterministic filesystem backups, the storage adapter can move to SQLite or JSON files behind the same renderer-facing data service.

### Replace browser-facing secret handling with main-process proxying

The current Express route protects `DECK_IMAGE_SERVER_URL` from the browser. In the desktop build, equivalent behavior should move to Electron main-process IPC so the renderer never receives the remote URL or any API key. The web development server can remain for browser testing, but desktop production should not start an external local server just to generate deck images.

### Package with electron-builder

Use `electron-builder` for the first Windows packaging path because it supports unpacked builds, NSIS installers, app metadata, icons, and common Windows artifact conventions from npm scripts. The first deliverable should include at least an unpacked Windows build for fast testing; installer signing can be added later.

## Risks / Trade-offs

- Electron increases package size -> Mitigate by keeping the first release focused, excluding unused files from packaging, and documenting the size trade-off.
- Renderer IndexedDB can still be harder to inspect than explicit files -> Mitigate with export/import and a storage adapter boundary before considering SQLite.
- Main/renderer IPC can accidentally expose broad capabilities -> Mitigate with `contextIsolation: true`, `nodeIntegration: false`, typed preload APIs, and input validation.
- Packaged asset paths can differ from Vite development paths -> Mitigate with a desktop smoke test that verifies built-in flags, icons, card backs, and tablecloths render from the packaged app.
- Existing Chinese text appears to have encoding issues in some files or console output -> Mitigate by preserving UTF-8 file encoding during edits and avoiding broad text rewrites while implementing desktop infrastructure.

## Migration Plan

1. Add Electron main, preload, and renderer type declarations without changing the existing web behavior.
2. Introduce a deck-image client adapter that uses desktop IPC when available and falls back to `/api/deck-image`.
3. Configure Vite/Electron development startup and production loading from packaged renderer assets.
4. Add desktop build scripts, package metadata, and Windows app icon placeholders or assets.
5. Add export/import and backup behavior around the existing localforage data keys.
6. Verify web development, desktop development, production renderer build, and Windows packaged smoke behavior.

Rollback is straightforward while the web fallback remains intact: remove desktop scripts/dependencies and keep the existing Vite/Express development path.

## Open Questions

- Should the first desktop build use the existing KARDS logo assets as the Windows app icon, or should a dedicated `.ico` be created?
- Should browser-to-desktop migration be manual export/import for the first version, or should the app attempt to locate a known browser profile?
- Does the deck-image service require only `DECK_IMAGE_SERVER_URL`, or should the desktop proxy also support `GEMINI_API_KEY`-backed features in the first pass?
