## 1. Desktop Runtime Setup

- [x] 1.1 Add Electron and Windows packaging dependencies to `package.json`.
- [x] 1.2 Add Electron main-process entry, preload entry, and renderer type declarations.
- [x] 1.3 Configure Vite/TypeScript outputs so the renderer and Electron runtime can build separately.
- [x] 1.4 Add development scripts for launching Vite with the Electron shell.

## 2. Secure Desktop Shell

- [x] 2.1 Create the native Windows application window with production asset loading and development hot-reload loading.
- [x] 2.2 Enable `contextIsolation`, disable renderer Node integration, and expose a narrow `window.kardsDesktop` preload API.
- [x] 2.3 Add renderer-side desktop API detection while preserving browser fallback behavior.
- [x] 2.4 Add an error path for renderer load failures or missing packaged assets.

## 3. Deck-Image Proxy

- [x] 3.1 Move desktop deck-image generation into a main-process IPC handler.
- [x] 3.2 Validate deck-image IPC input and keep remote service configuration out of renderer code.
- [x] 3.3 Refactor the renderer deck-image request flow to use desktop IPC when available and `/api/deck-image` otherwise.
- [x] 3.4 Verify the desktop app reports a clear configuration error when the remote service URL is missing.

## 4. Desktop Data Storage

- [x] 4.1 Inventory current `localforage` keys and define a versioned backup schema.
- [x] 4.2 Add export behavior for decks, collections, settings, custom categories, custom tablecloths, and cached deck images.
- [x] 4.3 Add import behavior with validation, schema version handling, and no partial overwrite on failure.
- [x] 4.4 Confirm local persistence survives desktop app restart from the Electron user data profile.

## 5. Windows Packaging

- [x] 5.1 Configure Windows app metadata, product name, version, and icon packaging.
- [x] 5.2 Add scripts for renderer build, Electron runtime build, and Windows unpacked or installer build.
- [x] 5.3 Exclude development-only files and local `.env` secrets from packaged artifacts.
- [x] 5.4 Ensure built-in flags, nation icons, card backs, tablecloths, and logo assets are included in the packaged app.

## 6. Verification

- [x] 6.1 Run TypeScript validation for the updated web and desktop code paths.
- [x] 6.2 Build the production renderer and Electron runtime.
- [x] 6.3 Launch the desktop development app and verify the main deck-management workflows.
- [x] 6.4 Launch the packaged Windows artifact and verify startup, local persistence, asset rendering, import/export, and deck-image error handling.
- [x] 6.5 Document the Windows development test build command and artifact location.
