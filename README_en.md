<p align="center">
  <img src="docs/assets/kards-toolbox-brand.png" alt="KARDS Toolbox brand" width="200">
</p>

# KARDS Toolbox

[中文](README.md) | English

KARDS Toolbox is a local tool for KARDS players to browse cards, build and manage decks, and simulate opening card packs.

Current version: **1.4.3**.

## Screenshots

| 1. Welcome page | 2. Deck management |
| :---: | :---: |
| <img src="docs/assets/01-welcome.png" width="400" alt="Welcome page"> | <img src="docs/assets/02-decks.png" width="400" alt="Deck management"> |
| **3. Deck building** | **4. Deck analysis** |
| <img src="docs/assets/03-deck-builder.png" width="400" alt="Deck building"> | <img src="docs/assets/04-deck-analysis.png" width="400" alt="Deck analysis"> |
| **5. Card library** | **6. Card details** |
| <img src="docs/assets/05-card-library.png" width="400" alt="Card library"> | <img src="docs/assets/06-card-detail.png" width="400" alt="Card details"> |
| **7. Pack selection** | **8. Pack opening simulation** |
| <img src="docs/assets/07-pack-selection.png" width="400" alt="Pack selection"> | <img src="docs/assets/08-pack-opening.png" width="400" alt="Pack opening simulation"> |
| **9. Deck comparison** | **10. Deck sharing image** |
| <img src="docs/assets/09-deck-comparison.png" width="400" alt="Deck comparison"> | <img src="docs/assets/10-deck-export.png" width="400" alt="Deck sharing image"> |
| **11. Mini deck image** | **12. Deck image shortcut** |
| <img src="docs/assets/11-deck-export-mini.png" width="400" alt="Mini deck image"> | <img src="docs/assets/12-deck-image-shortcut.png" width="400" alt="Deck image shortcut"> |
| **13. Custom tablecloth** | **14. Data and cache management** |
| <img src="docs/assets/13-custom-tablecloth.png" width="400" alt="Custom tablecloth"> | <img src="docs/assets/14-data-and-cache.png" width="400" alt="Data and cache management"> |

## Usage

The control names below are English descriptions of the Chinese interface shown in the screenshots.

### Keyboard shortcuts

| Action | Shortcut |
| --- | --- |
| Close a floating window or cancel the current action | Esc |
| Confirm an action | Enter |
| Save and exit the deck builder | Ctrl+Enter |
| Undo in the deck builder | Ctrl+Z |
| Redo in the deck builder | Ctrl+Y / Ctrl+Shift+Z |
| Change card pool pages | Mouse wheel |
| Switch cards in the details view | Mouse wheel |
| Switch pack types | Mouse wheel (different halves of the window) |

### How to read deck analysis or deck comparison?

**Where to find it:**

| 1. Bottom-right of deck details | 2. Top-right of the deck builder |
| :---: | :---: |
| <img src="docs/assets/1-decks-marked.png" width="400" alt="Deck analysis button in deck details"> | <img src="docs/assets/2-deck-builder-marked.png" width="400" alt="Deck analysis button in the deck builder"> |

**At a glance:**

<img src="docs/assets/3-deck-analysis-marked.png" width="800" alt="Annotated deck analysis overview">

**Ability scores:**

Ability scores are the core of deck analysis. By estimating a deck's economy, control, effect chains, and net costs, the tool scores five capabilities to help players understand and improve their decks. Scores range from 0 to 100; a higher score indicates greater capacity in that dimension.

| Ability score | Description |
| --- | --- |
| Development tempo | Can the deck establish a board promptly, play cards in succession, and accelerate deployment through ramp and cost reductions? |
| Offense | Can the deck keep threatening the enemy headquarters through unit attacks, stat growth, and direct damage? |
| Removal and control | Can the deck handle enemy units through pinning, suppression, and taking control, while disrupting the opponent through forced discards, cost increases, and lockouts? |
| Hand sustain | After accounting for costs such as discards and self-damage, can the deck keep replenishing playable cards and avoid running out of cards in hand? |
| Defense | Can the deck withstand attacks and stay alive through board presence, trades, repairs, and protection such as immunity, Smokescreen, and Guard? |

## Run from source

Requires Windows 10/11 x64, Node.js 22, npm, Go 1.26.2 or later, and the WebView2 Runtime. Prepare game assets you are authorized to use or a compatible resource pack before building. [Static asset setup (Chinese)](docs/build-and-run.md#静态资源与源码仓库)

```powershell
npm ci
npm run dev:desktop
```

## License

The project's code and documentation are licensed under the [MIT License](LICENSE). KARDS trademarks, game assets, card data, game content visible in screenshots, and third-party dependencies retain their respective ownership and licensing terms. See [Third-party content and licenses](THIRD_PARTY_NOTICES_en.md). This is an unofficial project.

Further reading: [Feature details (Chinese)](docs/feature-details.md) · [Build and run (Chinese)](docs/build-and-run.md) · [Architecture (Chinese)](docs/architecture.md) · [Interface guidelines (Chinese)](DESIGN.md) · [Contributing](CONTRIBUTING_en.md) · [Security reports](SECURITY_en.md).
