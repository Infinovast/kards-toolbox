## ADDED Requirements

### Requirement: Desktop-owned local persistence
The system SHALL persist decks, collections, settings, custom tablecloths, custom card backs, and cached deck images under the Windows desktop application's user data ownership boundary.

#### Scenario: Restart preserves data
- **WHEN** a user creates or edits deck data and then closes the desktop app
- **THEN** reopening the desktop app shows the saved deck data, visual settings, and user-provided image assets

#### Scenario: Offline startup
- **WHEN** the desktop app starts without internet access
- **THEN** saved decks, collections, settings, and local visual assets remain available

### Requirement: Data migration compatibility
The system SHALL support moving compatible data from the existing web build into the Windows desktop build.

#### Scenario: Import exported web data
- **WHEN** a user imports a supported export from the web build
- **THEN** the desktop app restores decks, collections, settings, custom tablecloths, custom card backs, and cached deck-image data that match the supported schema

#### Scenario: Unsupported import data
- **WHEN** a user imports missing, corrupt, or unsupported data
- **THEN** the system rejects the import with a clear error
- **AND** existing desktop data remains unchanged

### Requirement: User-controlled backup
The system SHALL allow users to export desktop deck-manager data into a portable backup file.

#### Scenario: Export backup
- **WHEN** a user exports a backup
- **THEN** the system writes a portable file containing the supported deck-manager data keys
- **AND** the file can be imported into another compatible app installation

### Requirement: Storage schema versioning
The system SHALL version persisted data so future migrations can be applied safely.

#### Scenario: Open older supported data
- **WHEN** the app reads data with an older supported schema version
- **THEN** it migrates the data to the current schema before use
- **AND** preserves the user's decks and custom assets
