# 构建与运行

## 环境

- Windows 10/11 x64，Node.js 22 和 npm。
- 应用最小窗口为 980 × 640。
- 在含 `package.json` 的项目根目录执行下列命令。
- 首次安装依赖需要联网；运行应用不需要 API Key。

## 开发

```powershell
npm install
npm run dev:desktop
```

桌面开发会启动 Vite、编译 Electron 主进程及 preload，再打开应用。只调试界面时使用 `npm run dev:renderer`，访问 `http://127.0.0.1:5173`。

`npm run dev` 提供可选的本地 Web 服务，默认端口 3000；桌面应用无需启动该服务。

## 检查与构建

```powershell
npm run lint
npm test
npm run build:desktop
```

- `lint`：TypeScript 检查。
- `test`：核心逻辑测试；卡池布局可另行执行 `npx tsx src/lib/cardPoolLayout.test.ts`。
- `build:desktop`：生成 `dist/` 网页资源和 `dist-electron/` 主进程资源。
- `npm run build`：生成网页和可选 Web 服务。

验证构建后的桌面资源：

```powershell
$env:KARDS_USE_DIST = '1'
node scripts/start-electron.cjs .
Remove-Item Env:KARDS_USE_DIST
```

## Windows 打包

```powershell
npm run dist:win:dir
npm run dist:win:zip
npm run dist:win:portable
```

输出目录为 `release/`。解包主程序是 `release/win-unpacked/kards_toolbox.exe`，便携包是 `release/kards_toolbox.exe`；`npm run app` 启动解包主程序。`npm run dist:win` 同时生成配置中的安装包等目标。

已有程序占用输出目录时，可指定独立目录：

```powershell
node node_modules/electron-builder/cli.js --win zip --x64 '--config.directories.output=release/build'
```

应用版本取自 `package.json`，构建和打包不会再次递增版本。发布前需重新构建，旧发布包不会自动更新。

## 数据位置与迁移

桌面应用默认使用 `%APPDATA%\KARDS Toolbox` 保存用户数据；若检测到已有历史数据，会优先保持可访问。启动参数 `--user-data-dir` 可指定隔离目录。

开发网页、桌面应用和不同端口的浏览器预览拥有独立存储。迁移卡组和设置请使用应用内备份；卡牌数据库及普通卡图缓存独立管理。

## 常见问题

- **数据仍是旧版**：在设置中获取数据，核对差异后应用。启动不会覆盖已应用牌库。
- **卡图缺失**：检查网络后在设置中缓存或重试失败项；完整图和缩略图分别统计。
- **桌面界面没有更新**：重新执行 `npm run build:desktop`，确认启动的是新的构建目录或发布包。
- **下载频繁失败**：增加下载浮窗中的卡间等待，减少并发数，稍后重试。
