# 第三方内容与许可证

[中文](THIRD_PARTY_NOTICES.md) | [English](THIRD_PARTY_NOTICES_en.md)

## 项目源码

KARDS Toolbox 自行编写的代码和文档采用 [MIT License](LICENSE)。该许可仅涉及贡献者有权授权的内容，不改变第三方内容的许可证或权属。

## KARDS 及卡牌资料

本项目为非官方玩家工具，与 KARDS、1939 Games 及数据来源网站不存在官方关联。

- 本项目不直接提供 KARDS 游戏客户端、安装包或游戏美术、音效、视频等其他受版权保护的内容。
- KARDS 名称、标志、卡图、卡背、总部、桌布、图标及其他游戏美术归各自权利人所有，不以本项目 MIT 许可证重新授权。
- `public/data/cards.json` 是供程序读取的卡牌资料快照；卡牌文字、资料和图片地址来自 KARDS 及社区数据源。`src/data/` 中引用或整理的游戏名称、描述、预设卡组和资源清单同样不构成对原始内容的重新授权。
- README 与 `docs/assets/` 的界面截图包含游戏美术，仅用于展示本工具，不提供其中游戏素材的独立使用许可。
- 数据及图片来源主要为 [kards.com](https://www.kards.com/) 和 [kardsplayer.com](https://kardsplayer.com/)。浏览器预览的卡图请求使用 [wsrv.nl](https://wsrv.nl/) 图片代理。
- `assets-private/`、资源包和本地缓存不纳入源码仓库。自行准备、抓取、使用或分发这些内容前，应核实来源的使用条款和相应授权；打成资源包不改变素材权属。

## 软件依赖

依赖按其各自许可证使用。JavaScript 和 Go 依赖版本分别记在 `package-lock.json` 和 `desktop/go.mod` 中。

| 组件 | 许可证及说明 |
| --- | --- |
| React、Motion、localForage、jsQR、QRCode、react-easy-crop | MIT；保留各组件的版权声明及许可证 |
| Lucide | ISC；部分图标源自 Feather，另有 MIT 声明，以组件附带许可证为准 |
| Go 标准库、Brotli | BSD-3-Clause |
| Wails、go-webview2 | MIT |
| Microsoft Edge WebView2 Runtime | 桌面应用使用系统安装的运行时，适用微软的许可条款 |
| Sharp、libvips | 开发测试依赖，适用组件自带的许可 |
| Vite、esbuild、Express、Tailwind CSS 等构建及服务依赖 | 按各组件附带许可证使用；Lightning CSS 使用 MPL-2.0 |

`npm run build:web` 将生产依赖的许可证收集到 `dist/THIRD_PARTY_LICENSES.txt`。桌面构建补充 Go 的运行依赖许可，将完整文本、中英文第三方说明和项目 MIT 许可证嵌入 EXE。文件夹版也在 EXE 旁附上这些文本。

收集文件用于保留软件依赖声明，不替代游戏内容授权，也不自动满足所有二进制组件的源码提供义务。重新分发前应结合实际产物、所含组件及对应版本检查许可要求。
