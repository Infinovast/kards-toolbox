# 项目架构

## 技术与运行边界

React 19、TypeScript、Vite 和 Tailwind CSS 4 构成渲染端，Electron 提供 Windows 桌面能力。用户数据通过 localforage 保存在 IndexedDB；Sharp 负责桌面图片生成，浏览器预览使用 Canvas。

渲染进程不启用 Node 集成，桌面能力经隔离的 preload 接口调用。生产资源由 `kards://app` 本地协议提供；可选 Web 服务用于浏览器开发，不参与桌面启动。

```text
React 界面 → 共享业务模块 → localforage / IndexedDB
                  ↓
             preload 桌面接口
                  ↓
Electron 主进程 → 固定数据源、图片下载、文件对话框、剪贴板、Sharp
```

## 目录与职责

| 路径 | 职责 |
| --- | --- |
| `src/App.tsx` | 应用导航、卡组列表与详情、主题、设置及备份入口 |
| `src/components/CardLibrary.tsx` | 卡牌筛选、分页、总部堆叠与资料详情 |
| `src/components/DeckBuilder.tsx` | 构筑会话、增减牌、规则、历史记录及保存 |
| `src/components/DeckCardStrip.tsx` | 国家底色卡牌条、费用、缩略图、数量及悬浮预览 |
| `src/components/CardDetailModal.tsx` | 卡牌详情与来源位置动画 |
| `src/components/TableclothBackground.tsx` | 桌布双层淡入淡出，保持工作区内容独立 |
| `src/components/DeckCardMotion.tsx` | 构筑加减牌、撤回/重做的飞行动画和数字反馈 |
| `src/components/CardDataUpdater.tsx` | 数据源选择、获取、差异预览、应用与回退 |
| `src/components/CardCacheManager.tsx` | 缓存分类、覆盖统计、预览、重试与删除 |
| `src/lib/cardData.ts`、`cardDatabase.ts`、`cardDataSync.ts` | 卡牌数据校验、持久化和跨页面同步任务 |
| `src/lib/cardImages.ts`、`cardImageDownload.ts`、`imageDownloads.ts` | 图片缓存、下载校验及后台队列 |
| `src/lib/deckCode.ts`、`deckImport.ts`、`deckRules.ts` | 卡组码、导入和构筑规则 |
| `src/lib/cardFilters.ts`、`cardPoolLayout.ts` | 共享筛选语义与自适应分页布局 |
| `src/lib/cardKeywords.ts`、`cardSort.ts` | 统一词条翻译、属性识别与文字强调；牌库主排序及费用、类型次级排序 |
| `src/components/PageIndicator.tsx`、`src/lib/pagination.ts` | 共用首尾页、邻近页及省略号导航，支持点击与键盘；滚轮翻页由卡池区域负责 |
| `src/data/cardSubtypes.json`、`src/lib/cardSubtypes.ts` | 本地子类定义、卡牌映射及详情展示 |
| `src/lib/deckRenderer.ts`、`deckRenderCounter.ts` | Canvas 生图及共享计数器绘制 |
| `src/lib/deckImageCode.ts`、`deckImageQr.worker.ts`、`deckImageImport.ts` | 含卡组名、总部和卡背标识的二维码载荷、后台识别及卡名文字匹配 |
| `electron/windowsOcr.ts` | 本机 Windows OCR，图片转换、临时文件清理与超时限制；通过受限 IPC 返回文字 |
| `src/lib/cardAssets.ts`、`src/data/` | 卡背、总部、桌布和战备卡组清单 |
| `src/lib/backup.ts` | 用户备份的校验、导出和恢复 |
| `src/types/` | 卡牌模型、桌面接口及类型定义 |
| `electron/main.ts`、`preload.ts` | 窗口、受限 IPC、本地协议及桌面能力 |
| `electron/cacheBundle.ts`、`src/lib/cacheBundle.ts` | 完整包流式解压、启动前缓存导入、一次性标记及清理 |
| `electron/deckRenderer.ts` | 使用本地资源和已缓存卡图生成 PNG |
| `public/data/cards.json` | 安装时提供的只读卡牌快照 |
| `public/assets/` | 随应用分发的卡背、总部、桌布、标志及筛选图标 |
| `scripts/` | 构建、启动、打包辅助及交互验证脚本 |

## 卡牌数据更新

设置中选择 `kardsplayer` 或 `kardscom` 来源，调用共享分页与校验逻辑。桌面经 `cards:fetch-page` IPC 请求固定 GraphQL 端点，浏览器使用同样的数据模型；不向渲染端开放任意网络代理。

```text
手动获取 → 分页及完整性校验 → 候选快照 → 新旧差异 → 用户应用
                                              ↓
                                      当前快照 / 上次快照
```

完整获取后按 `importId` 比较新增、修改和移除，多语言文本逐字段比较。获取、应用和回退先完成持久化，再切换内存数据；取消、网络错误或写入失败不会覆盖当前牌库。任务位于模块级状态中，切换页面不终止获取。

图片地址属于卡牌数据；获取牌库不下载图片，应用数据也不清理现有图片缓存。卡名相同的原卡、老兵卡等记录按各自标识独立保存。

本地天气清单补齐变体和生成关系，基础天气卡保留来源数据及图片地址；加载旧快照时修复曾被补充数据覆盖的基础天气图片地址。

## 图片缓存与后台下载

卡图统一使用中文完整图和缩略图，多语言卡牌文字仍用于搜索和详情。每种图片以卡牌编号及实际 URL 组成独立缓存键，URL 改变后可下载新文件，旧缓存保留以支持数据回退。

- 查看或批量缓存一张卡时，同时补齐完整图与缩略图；失败重试只下载缺项。
- 卡牌条读取独立缩略图，悬浮大图及生图读取完整图；不以整图裁切冒充缩略图。
- 桌面下载由主进程校验 URL 和文件签名；浏览器预览通过图片代理获取。
- 后台队列默认间隔 500ms、并发 1，可调整为 100ms–30s、1–8 个任务。连续失败延长启动间隔，等待计入速度和剩余时间。
- 暂停不取消已发出的请求，恢复后继续未完成项；用户主动暂停的时间不计入平均速度。
- 缓存页只枚举与读取本地图片。按当前牌库分别计算完整图和缩略图的卡牌覆盖数，支持成对删除、失败重试及旧缓存清理。

## 本地存储与备份

| 数据 | 存储键或位置 | 用户备份 |
| --- | --- | --- |
| 当前、候选及上次卡牌快照 | `kards_card_database_v1` | 不包含 |
| 卡组与收藏夹 | `kards_decks`、`kards_collections` | 包含 |
| 构筑草稿 | `kards_builder_draft` | 包含 |
| 设置、分类与用户图片 | `kards_settings` 等用户存储键 | 包含 |
| 完整图与缩略图 | `kards_card_image_v2_` 前缀，按编号和 URL 分键 | 不包含 |
| 下载失败与最近批次 | `kards_card_image_failures_v1`、`kards_card_image_batch_v1` | 不包含 |
| 卡组生图缓存 | `deck_img_local_v1_` 前缀 | 包含 |

用户数据目录固定为 `%APPDATA%\kards-toolbox`，不查找旧目录；测试可用 `--user-data-dir` 隔离。用户备份不能覆盖独立管理的卡牌数据库和普通卡图缓存。

完整包分为 `-dir-full.zip`（松散程序文件）和 `-portable-full.zip`（单个便携 EXE），都在 EXE 同级分发独立 Brotli 缓存包。松散版从程序所在目录读取数据包；便携版通过 `PORTABLE_EXECUTABLE_DIR` 定位外层 EXE 目录。启动时先检查用户目录的完成标记，无标记才解压包；在 React 应用挂载前经受限 IPC 逐项导入 IndexedDB，只补缺失图片、保留已应用牌库。全部写入成功后清理解压目录、原子写入标记并删除分发包；中断后可幂等重试。普通发布包不含缓存包，保持原有启动行为。

构建脚本锁定源数据目录后复制 IndexedDB 临时快照，使用共享牌库和图片键逻辑导出当前有效缓存，排除所有个人数据。包采用逐行记录和 Brotli 质量 11，解压时校验牌库、图片键、格式、重复项及尾部数量，不接受包内路径。只保留当前项在内存中，不一次加载整个缓存包。

## 构筑、资源与界面

卡组码使用共享编解码模块；总部由显示层补入总数，不占用可用牌记录。规则校验与卡池筛选分开：主国和盟国卡池限制决定候选，规则决定提示；已有或未知卡不因筛选被删除。

卡池按可见宽高在预设尺寸范围内选择完整行列，不纵向滚动；容器变化时重新计算，滚轮驱动分页。资料库与构筑共用类型、子类、费用等筛选语义；子类映射与官方卡牌数据分开维护。

资料库详情模式保存在 `kards_settings.cardDetailMode`，支持共享 modal 与原有侧栏。构筑单击立即打开详情，弹窗捕获原点击位置的第二次点击以完成双击加牌，不再为区分单击与双击延迟开窗。卡组详情对卡组按钮的点击单独处理，重复选择当前卡组不触发关闭重开。

卡背、总部及桌布由 JSON 清单管理适用国家、名称、图片及关联关系。选中卡组可临时切换总部桌布，退出后恢复用户设置；生图中的桌布选择仅影响本次导出。生图读取本地缓存，缺图显示占位，不依赖在线出图服务。

总部名称、英文名、简介与历史集中维护在 `src/data/headquarters.json`，图片扁平存放于 `public/assets/headquarters/`，使用“阵营_总部英文名.png”命名。清单的 `id` 和 `groupId` 保持稳定，以兼容已保存卡组及专属桌布关联。

界面颜色、间距、浮层与动画约定见 [界面规范](../DESIGN.md)。包依赖仍由 npm 管理，依赖自带许可证与 Electron 运行时许可证随各自组件保留；游戏素材的权属说明位于关于页。
