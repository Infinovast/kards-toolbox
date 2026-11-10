# 开发、构建与分发

## 准备

- Windows 10/11 x64、Node.js 22 和 npm。
- 保留 `package-lock.json`，首次安装或换机器时执行 `npm ci`，日常开发无需重复安装。
- 在包含 `package.json` 的项目根目录执行命令，目录可以重命名。
- 无二维码的图片导入使用 Windows 本机 OCR，需要相应语言的文字识别组件。

## 静态资源与源码仓库

Git 仓库不包含 `assets-private/`、`dist-packs/`、`.env`、构建产物和用户数据。仅克隆源码不能直接得到与截图一致的完整桌面版；`npm ci` 不会下载游戏素材。

桌面开发和构建需要以下两种资源来源之一，素材的使用和再分发须先核实 [第三方许可](../THIRD_PARTY_NOTICES.md)：

- **松散资源**：把有权使用的图片放入 `assets-private/static/assets/`，保持 `src/data/assets.json`、`cardbacks.json`、`headquarters.json`、`tablecloths.json` 和词条清单引用的相对路径。桌面构建还从 `assets/kards_logos/KardsLogoBlack_cards_new.png` 提取应用图标。
- **已有资源包**：把兼容的 `static.kpak` 放入 `dist-packs/static.kpak`。该方式在没有松散资源目录时使用，资源包与构建时的 salt 必须一致。

可先执行 `npx tsx scripts/build-packs.ts --static-only` 生成或验证静态包；桌面构建也会自动执行这一步。资源缺失时，纯网页构建 `npm run build:web` 仍可生成界面，但运行时缺少对应图像，桌面构建无法完成。

默认使用源码中的公开 `DEFAULT_PACK_SALT`。如需兼容自有资源包，可在本地 `.env` 设置 `KARDS_PACK_SALT`，网页和桌面构建应保持一致。该值只参与资源包散列和混淆，不是保护秘密的加密密钥；不要把真实凭据放入资源包或构建环境。`.env*` 均不提交。

## 日常开发

```powershell
npm ci
npm run dev:desktop
```

`dev:desktop` 启动 Vite、编译 Electron 主进程和 preload，再打开桌面应用。界面代码支持热更新；修改 `electron/` 中的主进程或 preload 后，停止并重新运行此命令。结束开发时在终端按 Ctrl+C。

| 场景 | 命令 | 结果 |
| --- | --- | --- |
| 桌面开发 | `npm run dev:desktop` | 开发窗口与界面热更新 |
| 只调试界面 | `npm run dev:renderer` | `http://127.0.0.1:5173`，无桌面专属接口 |
| 可选本地 Web 服务 | `npm run dev` | 默认端口 3000，桌面开发无需运行 |
| 类型检查 | `npm run lint` | TypeScript 检查 |
| 核心逻辑检查 | `npm test` | 单元测试 |
| 生图快捷页交互检查 | `node scripts/smoke-deck-image-page.cjs` | 先在 5189 端口启动渲染端；也可在桌面构建后加 `--desktop` 检查本地协议与 Sharp |
| 仅构建桌面资源 | `npm run build:desktop` | `dist/` 与 `dist-electron/`，不生成 EXE |
| 构建可选 Web 服务 | `npm run build` | 网页与 `dist/server.cjs` |

检查已构建的桌面资源，无需先打包：

```powershell
$env:KARDS_USE_DIST = '1'
try { node scripts/start-electron.cjs . }
finally { Remove-Item Env:KARDS_USE_DIST -ErrorAction SilentlyContinue }
```

## Windows 分发

发布前关闭正在运行的打包程序，再进行检查和打包。以下打包命令已经包含桌面构建，无需先单独执行 `build:desktop`。

```powershell
npm run lint
npm test
npm run dist:win:portable
```

按需要选择一种产物，不必全部生成：

| 命令 | `release/` 中的产物 | 如何分发 |
| --- | --- | --- |
| `npm run dist:win:dir` | `win-unpacked/` | 分发整个文件夹，不能只取其中的 EXE |
| `npm run dist:win:zip` | Electron Builder 输出的 ZIP | 分发 ZIP，用户完整解压后运行 |
| `npm run dist:win:portable` | `kards_toolbox.exe` | 分发这个便携 EXE |
| `npm run dist:win` | 配置中的安装包、便携版及解包目录 | 同时生成多个目标，按需要选用 |

`npm run app` 只启动 `release/win-unpacked/kards_toolbox.exe`，不构建发布目录，也不会启动便携 EXE。便携版直接双击对应 EXE。

发布根目录始终为 `release/`，文件夹版始终为 `release/win-unpacked/`，重复打包会更新同一目录，不按日期或版本创建新目录。ZIP 和安装包的文件名仍可包含版本号；这是文件名，不影响目录位置。

普通用户无需安装 Node.js、npm 或源码。程序文件夹中的 Electron 运行时及依赖文件属于正常分发内容，不能单独删除。应用版本取自 `package.json`；修改版本后必须重新打包，现有 EXE 和 ZIP 不会自动更新。

网页构建同时生成 `dist/THIRD_PARTY_LICENSES.txt`，收集已安装生产依赖的版权及许可证文本。标准桌面打包把它与 `LICENSE.KARDS-Toolbox.txt`、`THIRD_PARTY_NOTICES.md` 及 `THIRD_PARTY_NOTICES_en.md` 放在分发目录；保留 Electron/Chromium 和原生组件原有许可文件。自行组合发布包时也应包含这些声明，并核实游戏素材授权及 LGPL 组件的分发义务。

## 用户数据

桌面版统一使用 `%APPDATA%\kards-toolbox`，与源码和 `release/` 分开。清理项目构建输出不会清除用户卡组。升级或换机前，可在应用设置中备份卡组和设置；卡牌数据库及普通卡图缓存另行管理。

启动参数 `--user-data-dir` 可指定隔离数据目录。开发网页、桌面应用和不同端口的浏览器预览拥有独立存储。

## 常见问题

- **界面还是旧版**：确认启动的 EXE 路径；源码改动后需重新构建，发布版需重新打包。
- **输出目录被占用**：关闭该目录中的应用及资源管理器预览，再打包。
- **牌库数据较旧**：设置中获取更新，核对差异后应用；启动不会覆盖已应用数据。
- **卡图缺失**：设置中缓存或重试失败项；完整图和缩略图分别统计。
- **下载频繁失败**：增加下载浮窗中的卡间等待，减少并发数，稍后重试。
