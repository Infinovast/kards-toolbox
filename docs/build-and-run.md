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

- `dist/`：渲染端生产资源，包含卡牌目录。
- `dist-electron/`：主进程与 preload。
- `release/`：打包结果；`dist:win:dir` 生成解包目录，`dist:win` 生成安装包和便携包。
- 本轮已生成 `release/win-unpacked/KARDS Toolbox.exe`，可直接启动；移动时需保留整个 `win-unpacked` 文件夹。
- ZIP 开发包为 `release/KARDS Toolbox-0.2.1-win.zip`，解压后启动其中的 EXE，运行无需 Node.js。
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
node scripts/smoke-desktop.cjs 'release/win-unpacked/KARDS Toolbox.exe'
```

网页流程测试使用 Python Playwright。在一个终端启动 `npm run dev:renderer`，另一个终端运行：

```powershell
python -m pip install playwright
python -m playwright install chromium
python scripts/smoke-ui.py
python scripts/smoke-improvements.py
python scripts/smoke-navigation.py
```

网页测试会阻止所有外部网络请求，覆盖筛选、语言/历史图、卡组保存编辑、草稿、离线 PNG、备份边界与恢复；使用独立浏览器上下文。测试报告和下载产物写入 `test-results/`。桌面测试使用真实 preload/IPC/文件读写，仅替换系统文件选择器返回值，避免交互阻塞。

## 数据与离线使用

首发卡牌快照位于 `public/data/cards-v54.json`，复制自参考项目，1,646 条记录；它是仓库快照，不保证与当前线上游戏同步。

用户数据与图片通过 localforage 保存到 Chromium IndexedDB。桌面设置中可导出/导入 JSON 用户备份。开发 Vite、可选 Web 入口和打包后的 `kards://app` 属于不同 origin，测试它们时数据互相独立；开发数据不会自动迁移到便携包，可通过备份迁移。

- 初次载入卡牌文字、构筑、管理及本地图片生成均可离线。
- 选择未缓存的卡图会访问官方卡图代理并缓存；失败显示占位，不更改卡牌目录。
- 本地 PNG 导出仅读取简体中文 v54 卡图缓存；缺图仍能导出。
- 历史图 URL 不保证每张卡/每个语言都存在，缺图不会使用旧版属性替换现行资料。
- 当前尚无同步界面，不能通过应用更新卡牌目录。
- 便携 EXE 的应用数据仍使用 Electron 用户目录，不意味着数据保存在 EXE 旁。

## 常见问题

- 新卡不在目录：当前保留未知卡 ID，后续阶段实现用户手动同步，不会静默补卡。
- 卡组规则提示：属于允许保存和导出的提醒；游戏是否接受以游戏内规则为准。
- 无卡图：联网查看对应语言/版本后可缓存；卡牌本身的文字仍然可查。
- 备份不包含普通卡图缓存或首发牌库，它们与用户数据分开维护。
