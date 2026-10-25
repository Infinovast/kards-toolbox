## ADDED Requirements

### Requirement: Native Windows launch
The system SHALL provide a Windows desktop application entry point that launches the existing KARDS deck manager UI in a native application window without requiring the user to manually start a browser or Node server.

#### Scenario: Launch desktop app
- **WHEN** a user starts the Windows desktop application
- **THEN** the system opens a native window displaying the deck manager UI
- **AND** the user can manage existing deck workflows from that window

#### Scenario: Renderer load failure
- **WHEN** the desktop runtime cannot load the packaged renderer
- **THEN** the system displays a recoverable error state or diagnostic message instead of silently exiting

### Requirement: Secure renderer boundary
The system SHALL run the desktop renderer with Node integration disabled and SHALL expose only a narrow, typed desktop API through a preload boundary.

#### Scenario: Renderer requests desktop capability
- **WHEN** renderer code needs desktop-only behavior such as deck-image generation or app metadata
- **THEN** it calls the approved preload API
- **AND** it cannot directly access unrestricted Node.js modules

### Requirement: Web fallback preservation
The system SHALL preserve the existing browser development path while adding desktop behavior.

#### Scenario: Run web development server
- **WHEN** a developer runs the existing web development workflow
- **THEN** the React UI continues to load in a browser
- **AND** browser-only code paths continue to call the HTTP `/api/deck-image` proxy

### Requirement: Desktop deck-image proxy
The system SHALL route deck-image generation through the trusted desktop process in packaged desktop builds.

#### Scenario: Generate deck image from desktop
- **WHEN** a user requests a generated deck image in the Windows app
- **THEN** the renderer sends only the deck code to the desktop API
- **AND** the remote deck-image service URL remains unavailable to renderer code

#### Scenario: Deck-image service not configured
- **WHEN** no deck-image service URL is configured
- **THEN** the app reports a clear configuration error without breaking offline deck management
