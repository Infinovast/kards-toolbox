# 构建与运行

## 环境

- Windows 10/11 x64，Node.js 22 和 npm。
- 应用最小窗口为 980 × 640。
- 无二维码的图片导入使用 Windows 本机 OCR，需已安装对应语言的文字识别组件；二维码导入无需 OCR 语言组件。
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

### 自带缓存的完整包

先构建并打开应用，在应用中更新卡牌数据、完成所需卡图缓存后，再关闭应用：

```powershell
npm run dist:win:dir:full
npm run dist:win:portable:full
```

两种方式都生成 ZIP，输出到 `release/`：

| 命令 | 输出文件 | 解压后的内容 |
| --- | --- | --- |
| `dist:win:dir:full` | `kards_toolbox-<版本>-dir-full.zip` | `kards_toolbox.exe`、`resources/`、运行时等松散文件，以及 `kards-toolbox-cache.br` |
| `dist:win:portable:full` | `kards_toolbox-<版本>-portable-full.zip` | 单个便携 `kards_toolbox.exe` 和 `kards-toolbox-cache.br` |

均需完整解压后启动 `kards_toolbox.exe`，数据包与 EXE 同级。卡牌缓存使用 Brotli 最高质量压缩，ZIP 使用最高压缩设置；便携版 EXE 内部也使用最高压缩设置。

首次启动会将缓存包解压到用户数据目录，补入缺失大图与缩略图，并在尚无已应用牌库时应用包内数据。成功后写入完成标记，删除临时文件与 EXE 旁的数据包；后续启动直接跳过。失败或中断不会写入完成标记，下次可重试。目录只读导致数据包无法删除时，完成标记仍会阻止重复导入。

缓存包采用独立文件，避免嵌入便携 EXE 后每次启动都重新解压。它只包含当前卡牌数据和对应的有效图片缓存，不包含卡组、个人设置、草稿、用户图片、旧图片及失败记录。打包期间会锁定源数据目录，并从临时快照读取，不修改源数据；缺少缓存时终止打包。

可指定源数据目录，或仅导出数据包：

```powershell
npm run dist:win:dir:full -- --profile "D:\Profiles\kards-toolbox"
npm run dist:win:portable:full -- --profile "D:\Profiles\kards-toolbox"
npm run build:cache-bundle
```

最后一条命令生成 `release/kards-toolbox-cache.br`，可放在同版本松散程序或便携程序的 EXE 旁一起分发。缓存包导入标记为用户数据目录中的 `full-cache-applied.json`；同一用户目录只初始化一次，后续数据更新仍从设置中手动执行。

上述命令均可加 `--output "D:\Releases"` 指定输出目录。验证缓存导出与首次启动流程可运行 `node scripts/smoke-cache-bundle.cjs`，追加 `--pack` 可同时验证两种完整 ZIP 打包及松散文件版的首次启动。

## 数据位置

桌面应用统一使用 `%APPDATA%\kards-toolbox` 保存用户数据，不自动读取或迁移旧目录。启动参数 `--user-data-dir` 可指定隔离目录。

开发网页、桌面应用和不同端口的浏览器预览拥有独立存储。迁移卡组和设置请使用应用内备份；卡牌数据库及普通卡图缓存独立管理。

## 常见问题

- **数据仍是旧版**：在设置中获取数据，核对差异后应用。启动不会覆盖已应用牌库。
- **卡图缺失**：检查网络后在设置中缓存或重试失败项；完整图和缩略图分别统计。
- **桌面界面没有更新**：重新执行 `npm run build:desktop`，确认启动的是新的构建目录或发布包。
- **下载频繁失败**：增加下载浮窗中的卡间等待，减少并发数，稍后重试。
