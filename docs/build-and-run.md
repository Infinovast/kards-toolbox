# 开发、构建与分发

## 准备

- Windows 10/11 x64、Node.js 22 及 npm。桌面构建还需要 Go 1.26.2 或更新版本，运行桌面版需要 Microsoft Edge WebView2 Runtime。
- 将 Go 加入 PATH，或将环境变量 `KARDS_GO` 设为 `go.exe` 的绝对路径。构建脚本直接调用 Go，无需另装 Wails CLI。
- 保留 `package-lock.json`，首次安装或换机器时执行 `npm ci`，日常开发无需重复安装。
- 在包含 `package.json` 的项目根目录执行命令，目录可以重命名。

## 静态资源与源码仓库

Git 仓库不包含 `assets-private/`、`dist-packs/`、`.env`、构建产物和用户数据。仅克隆源码不能直接得到与截图一致的完整桌面版；`npm ci` 不会下载游戏素材。

桌面开发和构建需要以下两种资源来源之一，素材的使用和再分发须先核实 [第三方许可](../THIRD_PARTY_NOTICES.md)：

- **松散资源**：把有权使用的图片放入 `assets-private/static/assets/`，保持 `src/data/assets.json`、`cardbacks.json`、`headquarters.json`、`tablecloths.json` 和词条清单引用的相对路径。桌面构建从 `assets/kards_logos/` 读取 `KardsLogoBlack_cards_new.png` 和 `KardsLogoWhite_cards_new.png` 作为应用图标。
- **已有资源包**：把兼容的 `static.kpak` 放入 `dist-packs/static.kpak`。该方式在没有松散资源目录时使用，资源包与构建时的 salt 必须一致。

可先执行 `npx tsx scripts/build-packs.ts --static-only` 生成或验证静态包；桌面构建也会自动执行这一步。资源缺失时，纯网页构建 `npm run build:web` 仍可生成界面，但运行时缺少对应图像，桌面构建无法完成。

默认使用源码中的公开 `DEFAULT_PACK_SALT`。如需兼容自有资源包，可在本地 `.env` 设置 `KARDS_PACK_SALT`，网页和桌面构建应保持一致。该值只参与资源包散列和混淆，不是保护秘密的加密密钥；不要把真实凭据放入资源包或构建环境。`.env*` 均不提交。

## 日常开发

```powershell
npm ci
npm run dev:desktop
```

`dev:desktop` 构建并打开带开发者选项的 Wails 窗口，F12 可打开 WebView2 调试工具。修改代码后关闭窗口并重跑桌面命令。只调试 React 界面时可运行 `dev:renderer`，继续使用 Vite 热更新。

| 场景 | 命令 | 结果 |
| --- | --- | --- |
| 桌面开发 | `npm run dev:desktop` | 构建并打开开发窗口 |
| 只调试界面 | `npm run dev:renderer` | `http://127.0.0.1:5173`，无桌面专属接口 |
| 可选本地 Web 服务 | `npm run dev` | 默认端口 3000，桌面开发无需运行 |
| 类型检查 | `npm run lint` | TypeScript 检查 |
| 核心逻辑检查 | `npm test` | 单元测试 |
| 欢迎页与对比交互检查 | `python scripts/smoke-welcome.py` | 先执行 `npm run dev:renderer -- --port 5189`；需要 Python Playwright 和 Edge，检查启动偏好、三处对比入口、透明面板、构筑退出保护、现有卡组列表及自动分析、离开后状态保留、跨入口及并发判重、仅分析/导入保存、大图放大、统计表配色与绝对差距、评分名称与胶囊同色及最小窗口 |
| 卡牌与构筑交互检查 | `python scripts/smoke-card-workflows.py` | 先在 5189 启动渲染端；隔离浏览器数据，检查与/或/非、搜索框长度、缓存按钮显隐、临时天气 ID、详情一键对比、含预备自动选择及扩展筛选展开/收缩 |
| 全卡池评分核验 | `npx tsx src/lib/deckAnalysis.test.ts --audit` | 在 `references/deck-analysis/card-ability-audit.json` 记录当前全卡池的能力提取、未识别文本与近似假设；算法变动后可加 `--update-reference` 显式重算样本区间 |
| 生图快捷页交互检查 | `node scripts/smoke-deck-image-page.cjs` | 先在 5189 端口启动渲染端 |
| 缓存设置与应用内确认检查 | `node scripts/smoke-cache-settings.cjs` | 先在 5189 端口启动渲染端；隔离数据验证统计布局与空间、自动更新、失败重试、批量操作及确认弹窗，不访问真实剪贴板 |
| 构建桌面应用 | `npm run build:desktop` | `build/wails/kards_toolbox.exe` |
| 构建可选 Web 服务 | `npm run build` | 网页与 `dist/server.cjs` |

构建后可直接运行 `build/wails/kards_toolbox.exe`。下面的检查会启动真实的 WebView2 窗口，验证新数据目录成功载入卡图包：

```powershell
npm run build:cache-bundle
npm run test:desktop -- -Executable build/wails/kards_toolbox.exe -CardsPack release/cards.kpak
```

## Windows 分发

发布前关闭正在运行的打包程序，再进行检查和打包。以下打包命令已经包含桌面构建，无需先单独执行 `build:desktop`。

```powershell
npm run lint
npm test
npm run dist:win:dir
npm run dist:win:portable:full
```

按需要选择一种产物，不必全部生成：

| 命令 | `release/` 中的产物 | 如何分发 |
| --- | --- | --- |
| `npm run dist:win:dir` | `win-unpacked/kards_toolbox.exe` 及许可声明 | 双击目录内的 EXE |
| `npm run dist:win:zip` | `kards_toolbox-版本.zip`，内含 EXE | 解压后运行 |
| `npm run dist:win:portable` | `kards_toolbox.exe` | 分发这个便携 EXE |
| `npm run dist:win:portable:full` | `kards_toolbox-版本-portable-full.zip`，内含 EXE 和 `cards.kpak` | 完整解压到同一目录再运行 |
| `npm run dist:win:dir:full` | `kards_toolbox-版本-dir-full.zip`，内含 EXE 和 `cards.kpak` | 完整解压到同一目录再运行 |
| `npm run dist:win` | 同 `dist:win:dir` | 分发文件夹版 |

`npm run app` 只启动 `release/win-unpacked/kards_toolbox.exe`，不构建发布目录，也不会启动便携 EXE。便携版直接双击对应 EXE。

默认发布根目录为 `release/`。需要隔离构建输出时可传入 `-- --output <目录>`。首次打包发现旧的 Electron 文件夹时，脚本会将它保留为旁边的 `win-unpacked-electron` 目录。

EXE 内嵌界面、静态素材包与许可文本，运行时使用系统的 WebView2。若本机没有 WebView2，启动时会提示安装。需要离线部署时可在联网机器上另取微软的 Evergreen 独立安装程序。应用版本取自 `package.json`。 [WebView2 下载页面](https://developer.microsoft.com/microsoft-edge/webview2/#download-section)

完整包优先读取默认应用数据目录中的 `packs/cards.kpak`，然后查找 `dist-packs/cards.kpak` 和 `assets-private/cards.kpak`。默认应用数据目录为 `%APPDATA%\kards-toolbox`，可由 `KARDS_USER_DATA_DIR` 覆盖。可以通过 `npm run dist:win:portable:full -- --cards-pack <文件>` 指定任意兼容卡图包，或用 `--profile <数据目录>` 指定数据目录。若数据目录有当前生效的牌库快照，快照会随卡图打包。

## 用户数据

桌面版使用 `%APPDATA%\kards-toolbox`。WebView2 的 IndexedDB 放在其中的 `webview2/`，应用管理的牌库与卡图分别在 `card-data.json` 和 `packs/cards.kpak`。WebView2 不会自动读取或迁移 Electron 的 IndexedDB，即使两个版本使用相同的数据根目录；卡组和设置需先在原版应用中导出用户备份，再在新版应用中导入。现有 `packs/cards.kpak` 可直接复用，也可将兼容的 `cards.kpak` 与 EXE 放在一起启动。

数据根目录恢复一致后，测试或回看旧 Electron 版本前应先退出新版，避免两者同时写入同一个卡图缓存；需要并行比较时，请为两个版本使用各自独立的数据目录。

环境变量 `KARDS_USER_DATA_DIR` 可指定绝对路径作为隔离数据目录。开发网页、桌面应用和不同端口的浏览器预览拥有独立存储。

## 常见问题

- **找不到 Go**：运行 `go version` 检查 PATH，或设置 `KARDS_GO`。
- **界面还是旧版**：确认启动的 EXE 路径；源码改动后需重新构建，发布版需重新打包。
- **输出目录被占用**：关闭该目录中的应用及资源管理器预览，再打包。
- **牌库数据较旧**：设置中获取更新，核对差异后应用；启动不会覆盖已应用数据。
- **卡图缺失**：设置中缓存或重试失败项；完整图和缩略图分别统计。
- **下载频繁失败**：增加下载浮窗中的卡间等待，减少并发数，稍后重试。
