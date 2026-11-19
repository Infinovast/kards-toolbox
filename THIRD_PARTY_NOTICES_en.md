# Third-party content and licenses

[中文](THIRD_PARTY_NOTICES.md) | [English](THIRD_PARTY_NOTICES_en.md)

## Project source

Original KARDS Toolbox code and documentation are licensed under the [MIT License](LICENSE). This license covers only content the contributors are entitled to license. It does not change the licenses or ownership of third-party content.

## KARDS and card data

This is an unofficial tool for players. It has no official affiliation with KARDS, 1939 Games, or the websites providing data.

- The project does not directly distribute the KARDS game client, game installers, or standalone copyrighted game artwork, audio, video, or other game content.
- The KARDS name, logos, card artwork, card backs, headquarters, tablecloths, icons, and other game artwork belong to their respective rights holders. They are not relicensed under this project's MIT License.
- `public/data/cards.json` is a card data snapshot read by the application. Card text, data, and image URLs originate from KARDS and community data sources. Game names, descriptions, preset decks, and asset catalogs referenced or organized in `src/data/` likewise do not grant a new license to the underlying content.
- Interface screenshots in the README and `docs/assets/` contain game artwork. They illustrate the tool and do not grant a separate license to use the game assets shown in them.
- Data and images primarily come from [kards.com](https://www.kards.com/) and [kardsplayer.com](https://kardsplayer.com/). Card image requests in the browser preview use the [wsrv.nl](https://wsrv.nl/) image proxy.
- `assets-private/`, resource packs, and local caches are excluded from the source repository. Before obtaining, scraping, using, or distributing such content, check the source's terms of use and the relevant permissions. Packing assets into a resource file does not change their ownership.

## Software dependencies

Dependencies retain their own licenses. JavaScript and Go dependencies are recorded in `package-lock.json` and `desktop/go.mod`, respectively.

| Component | License and requirements |
| --- | --- |
| React, Motion, localForage, jsQR, QRCode, react-easy-crop | MIT; retain each component's copyright and license notices |
| Lucide | ISC; some icons originate from Feather and carry additional MIT notices. Refer to the licenses included with the component |
| Go standard library, Brotli | BSD-3-Clause |
| Wails, go-webview2 | MIT |
| Microsoft Edge WebView2 Runtime | The desktop app uses the system runtime under Microsoft's license terms |
| Sharp, libvips | Test dependencies under their respective licenses |
| Build and server dependencies such as Vite, esbuild, Express, and Tailwind CSS | Follow the license included with each component. Lightning CSS uses MPL-2.0 |

`npm run build:web` collects production dependency licenses in `dist/THIRD_PARTY_LICENSES.txt`. Desktop builds add the Go runtime dependency licenses and embed the collection, the Chinese and English third-party notices, and the project's MIT License in the EXE. Directory releases also include copies beside the EXE.

The collected file preserves software dependency notices. It does not grant permission to use game content or automatically satisfy every binary component's corresponding-source obligations. Before redistributing a build, check the requirements against the actual artifacts, included components, and exact versions.
