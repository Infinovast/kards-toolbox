# 构建与运行

## 环境

- Windows 10/11 x64。
- Node.js 22 LTS 与 npm，首次安装依赖需要网络。
- 默认界面最低窗口尺寸 980×640，常用开发尺寸 1280×820。

## 开发

```powershell
npm install
npm run dev:desktop
```

此命令启动 Vite（127.0.0.1:5173）、编译 Electron 主进程和 preload，并打开桌面窗口。只验证网页界面用 `npm run dev:renderer`。

`npm run dev` 提供 127.0.0.1:3000 的可选 Web 调试入口；桌面运行不需要 Express 服务。

应用不需要 `.env`、API Key 或远程卡组出图服务。如果 npm 阻止依赖的安装脚本，需按照 npm 的提示允许 Electron 安装脚本。Electron 下载超时可在终端配置可信镜像，例如：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
node node_modules/electron/install.js
```

## 检查与构建

```powershell
npm run lint
npm test
npm run build:desktop
npm run dist:win:zip
```

默认打包到 `release/`。若旧版正在运行并占用该目录，可在完成桌面构建后使用独立输出目录：

```powershell
node node_modules/electron-builder/cli.js --win zip --x64 '--config.win.signAndEditExecutable=false' '--config.compression=normal' '--config.directories.output=release/0.3.5'
```

- `dist/`：渲染端生产资源，包含卡牌目录。
- `dist-electron/`：主进程与 preload。
- `release/`：打包结果；`dist:win:dir` 生成解包目录，`dist:win` 生成安装包和便携包。
- 本轮已生成 `release/0.3.5/win-unpacked/KARDS Toolbox.exe`，可直接启动；移动时需保留整个 `win-unpacked` 文件夹。
- ZIP 开发包为 `release/0.3.5/KARDS Toolbox-0.3.5-win.zip`，解压后启动其中的 EXE，运行无需 Node.js。旧版运行时占用原输出目录，本轮使用独立版本目录。
- 本地检查生产资源可运行 `$env:KARDS_USE_DIST='1'; node scripts/start-electron.cjs .`。

打包配置复用 `node_modules/electron/dist` 的已安装运行时，避免 electron-builder 再次从 GitHub 下载。NSIS/portable 目标仍可能首次下载额外打包工具，本轮未验收单文件便携包。

## 自动流程验证

```powershell
# 单测与类型检查
npm test
npm run lint

# 已构建的桌面资源：使用独立临时用户目录，不影响日常数据
npm run test:desktop

# 解包后的真实 EXE
node scripts/smoke-desktop.cjs 'release/0.3.5/win-unpacked/KARDS Toolbox.exe'
node scripts/smoke-filter-icon-paths.cjs 'release/0.3.5/win-unpacked/KARDS Toolbox.exe'
```

网页流程测试使用 Python Playwright。在一个终端启动 `npm run dev:renderer`，另一个终端运行：

```powershell
python -m pip install playwright
python -m playwright install chromium
python scripts/smoke-ui.py
python scripts/smoke-improvements.py
python scripts/smoke-navigation.py
python scripts/smoke-card-data.py
python scripts/smoke-builder-interactions.py
python scripts/smoke-custom-filters.py
python scripts/smoke-deck-overlay.py
python scripts/smoke-deck-workflows.py
python scripts/smoke-card-strips.py
```

网页测试会阻止未替换的外部网络请求，覆盖筛选、语言/历史图、卡组保存编辑、草稿、离线 PNG、备份边界与恢复；牌库更新脚本用固定官方接口响应测试差异预览、应用/回退、持久化、写入失败及图片缓存隔离。均使用独立浏览器上下文，报告和产物写入 `test-results/`。桌面测试使用真实 preload/IPC/文件读写，替换系统文件选择器返回值和牌库请求的 HTTP 边界，避免交互与线上数据波动。

本轮执行无截图/读图的构筑交互、自定义筛选和卡组悬浮详情脚本；导航与牌库更新脚本也使用跳过截图的开关。桌面回归使用同一开关，跳过真实图片读取、像素和尺寸断言：

```powershell
$env:KARDS_SKIP_VISUAL_TESTS = '1'
python scripts/smoke-navigation.py
python scripts/smoke-card-data.py
npm run test:desktop
node scripts/smoke-desktop.cjs 'release/0.3.5/win-unpacked/KARDS Toolbox.exe'
node scripts/smoke-filter-icon-paths.cjs 'release/0.3.5/win-unpacked/KARDS Toolbox.exe'
Remove-Item Env:KARDS_SKIP_VISUAL_TESTS
```

`smoke-builder-interactions.py`、`smoke-custom-filters.py` 和 `smoke-deck-overlay.py` 仅验证 DOM、键盘、计算样式、布局稳定及资源可用性，不截图、不读取图片像素。`smoke-ui.py` 和 `smoke-improvements.py` 仍包含真实图片检查和截图，不在本轮执行范围内。

## 数据与离线使用

首发卡牌快照位于 `public/data/cards-v54.json`，复制自参考项目，1,646 条记录；它是仓库快照，不保证与当前线上游戏同步。

用户数据与图片通过 localforage 保存到 Chromium IndexedDB。左侧栏底部“设置”打开全宽页面，可导出/导入 JSON 用户备份、手动获取并更新牌库。开发 Vite、可选 Web 入口和打包后的 `kards://app` 属于不同 origin，测试它们时数据互相独立；开发数据不会自动迁移到便携包，可通过备份迁移用户数据，牌库需单独获取。

最近一次自动检测的有效剪贴板码单独存于本地 localStorage（`kards_last_clipboard_deck_code`），不属于用户备份。记录在提示出现前写入，取消、导入、重载和重启均不会使相同码再次提示；手动导入仍可重复使用同一码。

- 初次载入卡牌文字、构筑、管理及本地图片生成均可离线。
- 选择未缓存的卡图会访问官方卡图代理并缓存；失败显示占位，不更改卡牌目录。
- 本地 PNG 导出仅读取简体中文 v54 卡图缓存；缺图仍能导出。
- 历史图 URL 不保证每张卡/每个语言都存在，缺图不会使用旧版属性替换现行资料。
- 设置中点击“获取最新卡牌数据”，完整分页获取后对比新增、修改和移除；展开卡牌查看字段差异，再点击“应用更新”。总数相同也会检查文字/属性变化；可回退上次数据。
- 打开设置不联网，获取期间允许切换页面。取消、请求错误或不完整数据不替换当前牌库。更新牌库不下载、清空或替换已有卡图。
- 便携 EXE 的应用数据仍使用 Electron 用户目录，不意味着数据保存在 EXE 旁。

## 常见问题

- 新卡不在目录：在设置中手动获取并应用最新官方数据；卡组中的未知编号与数量保留。按 ID 补全尚未实现，不会静默补卡。
- 卡组规则提示：属于允许保存和导出的提醒；游戏是否接受以游戏内规则为准。
- 无卡图：联网查看对应语言/版本后可缓存；卡牌本身的文字仍然可查。
- 备份不包含普通卡图缓存或首发牌库，它们与用户数据分开维护。

### CSS 图标路径回归

`node scripts/smoke-filter-icon-paths.cjs` 验证当前构建的生产协议资源；传入 EXE 路径可验证打包版本。测试从实际控件的计算样式提取 35 个蒙版 URL，核对主机、资源路径、可读取状态和 MIME，并检查选中后的触发按钮图标。它不截图、不解码或比较图片。旧版 0.3.2 会因 `/assets/assets/filters/` 路径失败，避免只检查手动拼出的正确资源地址而漏掉 CSS 解析问题。
