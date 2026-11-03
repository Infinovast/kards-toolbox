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

Dependencies retain their own licenses; they do not become MIT-licensed because this project uses MIT. Dependency versions are pinned by `package-lock.json`.

| Component | License and requirements |
| --- | --- |
| React, Motion, localForage, jsQR, QRCode, react-easy-crop | MIT; retain each component's copyright and license notices |
| Lucide | ISC; some icons originate from Feather and carry additional MIT notices. Refer to the licenses included with the component |
| Sharp | Apache-2.0; prebuilt native packages also contain components under LGPL-3.0-or-later and other licenses |
| libvips and native libraries distributed with Sharp | Follow the native package's `LICENSE`, `README.md`, and upstream terms. Source and build materials for LGPL components are available through [sharp-libvips](https://github.com/lovell/sharp-libvips) and [libvips](https://github.com/libvips/libvips). When distributing binaries, check the obligations for the exact versions, including corresponding source availability and replacement or relinking |
| Electron, Chromium, Node.js | Retain the runtime's bundled license files and notices, including `LICENSE` and `LICENSES.chromium.html` |
| Build and server dependencies such as Vite, esbuild, Express, and Tailwind CSS | Follow the license included with each component. Lightning CSS uses MPL-2.0 |

`npm run build:web` collects full license texts from the currently installed production dependencies into `dist/THIRD_PARTY_LICENSES.txt`. Full-cache builds run the same collection step. Standard desktop packaging copies that file, the Chinese and English third-party notices, and the project's MIT License into the distribution directory. Licenses supplied with Electron and native dependencies must also remain with those components.

The collected file preserves software dependency notices. It does not grant permission to use game content or automatically satisfy every binary component's corresponding-source obligations. Before redistributing a build, check the requirements against the actual artifacts, included components, and exact versions.
