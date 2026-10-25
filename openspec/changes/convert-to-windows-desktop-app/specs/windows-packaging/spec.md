## ADDED Requirements

### Requirement: Windows development build
The system SHALL provide a scripted Windows desktop build that produces a launchable development test artifact.

#### Scenario: Build desktop artifact
- **WHEN** a developer runs the Windows desktop build script
- **THEN** the system builds the renderer and desktop runtime
- **AND** produces a launchable Windows artifact or unpacked executable

### Requirement: Application metadata
The system SHALL include Windows application metadata for product name, version, executable identity, and icon configuration.

#### Scenario: Inspect packaged app
- **WHEN** a user views the packaged Windows application
- **THEN** it displays KARDS deck manager branding instead of generic framework defaults

### Requirement: Packaged asset availability
The system SHALL package all required KARDS visual assets used by the desktop app.

#### Scenario: Open packaged app UI
- **WHEN** the packaged Windows app opens
- **THEN** built-in flags, nation icons, card backs, tablecloths, and KARDS logo assets render without remote network dependency

### Requirement: Desktop smoke verification
The system SHALL provide a documented or scripted smoke verification path for the Windows desktop build.

#### Scenario: Verify desktop build
- **WHEN** a developer completes a desktop build
- **THEN** they can verify launch, renderer load, local persistence, built-in asset rendering, and deck-image proxy error handling from the packaged artifact

### Requirement: Environment-safe packaging
The system SHALL avoid embedding development-only secrets or local `.env` files into distributable Windows artifacts.

#### Scenario: Package production app
- **WHEN** the production Windows package is created
- **THEN** local development `.env` files are excluded
- **AND** required remote-service configuration is supplied through an approved runtime configuration path
