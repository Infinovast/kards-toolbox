# 架构与复用说明

## 当前结构

```text
src/App.tsx                  桌面导航、卡组/收藏夹、全宽设置、用户备份入口
src/components/CardDataUpdater 卡牌数据获取、差异筛选与逐字段预览、应用/回退
src/components/CardCacheManager 设置中的逐卡缓存清单、筛选/重试
src/components/CardLibrary  本地目录筛选、多语言和单卡详情
src/components/DeckBuilder  构筑会话、草稿、规则配置、保存与导出
src/types/card.ts           三项目共享卡牌记录、语言/阵营、快照读取
src/lib/deckCode.ts         共享卡组码解码与编码（1/2/3/4 张区段）
src/lib/deckRules.ts        可配置规则校验，只提示不阻止保存
src/lib/cardFilters.ts      资料库/构筑共享筛选与构筑主盟国卡池边界
src/lib/cardImages.ts       完整卡图/缩略图 URL 分键缓存、下载与请求去重
src/lib/imageDownloads.ts  跨页面批量缓存任务与进度
src/lib/cardData.ts         Kardsplayer/KARDS 官方固定 GraphQL 查询、分页校验、多语言逐字段差异
src/lib/cardAssets.ts       卡背、总部、桌布的 JSON 清单与可用范围解析
src/lib/cardImageDownload.ts 图片 URL 校验、AVIF/PNG/WebP/JPEG 签名与 MIME 识别
src/lib/cardDatabase.ts     独立牌库快照的原子持久化
src/lib/cardDataSync.ts     跨页面获取任务、候选/应用/回退状态
src/lib/deckRenderer.ts     本地 Canvas PNG，读取缓存、不请求网络
src/lib/backup.ts           用户备份格式与读写
public/data/cards.json  随包牌库快照
electron/main.ts            窗口、本地资源协议、固定牌库请求、剪贴板和文件对话框
electron/preload.ts         受限桌面桥接
```

React 19 + TypeScript + Vite + Tailwind CSS 4，Electron 桌面壳。保留 Deck Collector 的 localforage 存储与界面系统，避免同时启动三个独立应用。渲染端关闭 Node 集成，开启 context isolation。

## 功能来源与改造

| 参考项目 | 复用内容 | 本轮处理 |
| --- | --- | --- |
| Kards-Deck-Collector | React 桌面壳、Electron、卡组/合集、收藏、标签、卡背、桌布、主题、备份 | 作为根工程；加入资料库和构筑导航、备注、编辑连接；移除远程出图与 TLS 绕过配置 |
| kards-image-tool | 多语言 `data.json`、阵营编码、按拷贝数分组的卡组码、稀有度上限、卡图 URL、Canvas 思路 | 直接复制快照和澳新资源；将代码逻辑改为共享 TS 模块及 React 页面；本地渲染器为整合后重写 |
| 用户提供的 kardsplayer-downloader | Kardsplayer 固定端点、分页参数、原始多语言 JSON、完整图/缩略图 URL | 随包数据使用其导出；在线查询适配为共享 TS 和桌面 IPC，保留原卡与老兵等独立记录。设置默认选用此来源，也可切换 KARDS 官方 GraphQL 来源 |
| koishi-plugin-kardsman | GraphQL 分页/同步思路、Sharp 渲染 | 已适配十列 Sharp 渲染及手动分页获取；完整取回后逐字段比较，显式应用/回退。不带入 Koishi 命令、定时器或图片同步；按 ID 补全尚未实现 |

保留原始项目供核对。所有实际改动在根工程，`references/` 不参与 TypeScript 检查、打包或根仓库版本管理。

## 本地数据边界

- `public/data/cards.json`：只读 Kardsplayer 多语言快照，包含实际 imageUrl/thumbUrl；卡图地址由卡牌数据指定，不提供历史版本切换。
- `src/data/cardbacks.json`、`headquarters.json`、`tablecloths.json`：内置卡背、总部卡图及详情、桌布清单；清单引用 `public/assets/` 下的 ASCII 文件名。总部专属桌布通过总部 `groupId` 关联，用户桌布选项排除总部专属项。
- `kards_card_database_v1`：独立可写牌库，包含 `schemaVersion: 1`、当前 `active`、上次 `previous`、待确认 `pending` 快照及 `lastCheckedAt`。每份快照保留数据、来源、获取/应用时间；不纳入用户备份。
- `kards_decks` / `kards_collections`：用户卡组及收藏夹；保留旧合集的存储键和字段，界面改为列表内可展开分组。规则集和自定义规则字段兼容旧卡组；不再提供备注功能，旧备份中的备注不显示。
- `kards_builder_draft`：当前构筑会话，自动保存，纳入用户备份。
- `kards_settings`、`kards_custom_categories`、桌布键：继承的用户设置和图片。
- `kards_card_image_v2_{importId}_{encodeURIComponent(resolvedURL)}`：完整图和缩略图各按解析后的实际 URL 缓存；URL 变化后下载新文件，牌库回退可复用旧文件。
- `kards_card_image_v1_54_zh-Hans_{importId}`：仅兼容没有新图片 URL 的旧快照；两类普通卡图缓存均不纳入用户备份。
- `kards_card_image_failures_v1` / `kards_card_image_batch_v1`：按实际图片 URL 保存失败原因/时间和最近批量范围，供设置页恢复失败清单与重试。它们不属于用户数据备份。
- `deck_img_local_v1_{code}`：本地卡组图片缓存，纳入备份。每次生成重新读取现有卡图，避免永远停留在缺图状态。

用户备份格式仍采用 schemaVersion 1，接受原 `kards-deck-collector` 和 `kards-local-tool` 标记，新备份使用 `kards-toolbox`。卡牌库和普通卡图缓存不能由用户备份覆盖。

应用对外名称为 KARDS Toolbox（KARDS 工具箱）；安装应用 ID 保持不变。默认用户目录使用新名称，但若旧中文/英文/包名目录已存有 IndexedDB 且新目录没有数据，会继续使用旧目录；显式 `--user-data-dir` 不受此兼容处理影响。

## 手动牌库更新

左栏上部连接卡组与卡牌，底部为桌布和设置。设置是全宽工作区页面，打开页面只读取本地状态，不请求官方数据。

用户点击获取并选择来源后，桌面端通过 preload 的 `fetchCardDataPage(offset, source)` 调用固定 `cards:fetch-page` IPC；主进程使用 `electron.net.fetch` 请求对应固定端点：Kardsplayer `https://api.kardsplayer.com/graphql` 或 KARDS 官方 `https://herokuapi.kards.com/graphql`。浏览器预览直接请求相同的固定端点。端点与查询固定，不允许渲染端指定任意 URL。两种来源都分页获取卡牌字段，并进入同一套校验、逐字段差异比较、显式应用和回退流程；图片字段作为 URL 保存，获取资料不会下载图片文件。新安装的内置快照仍取自 Kardsplayer 导出，设置默认来源为 Kardsplayer。

参考 Kardsman 的分页思路，但不采用“总数相同就跳过”的策略。完整数据经类型、唯一编号、分页计数与完整性校验后，按 `importId` 比较新增/修改/移除。多语言逐字段展开，忽略 JSON 键顺序和根级 API 记录数字 ID；统一重复的 `reserved` 字段。获取任务保存在模块级 external store，切换页面不中断，取消或失败不会替换当前数据。

获取只写入候选快照，来源与数据一同保存；应用后才切换共享牌库并重新计算卡组规则提示。当前、候选和回退数据写在同一个 IndexedDB 值内，写入失败不会出现半应用状态；应用失败保留候选，允许重试。回退同样先持久化成功，再切换界面。启动优先读取已应用快照，否则使用随包 Kardsplayer 快照；不在启动时静默迁移已应用的旧快照。未知卡仍保留卡组码和数量，以编号显示。

牌库获取/应用保留全部已有卡图缓存；默认“当前卡图”使用新数据 URL 指定的版本，不能继续硬编码 v54。每次查看或批量缓存一张卡时，同时请求完整图与缩略图并按 URL 去重；单独失败不影响另一种图片显示，批量任务要求两种均完成，重试只补缺项。卡牌条固定读取缩略图，悬停预览与 PNG 导出使用完整图。对于没有图片 URL 的旧牌库记录，只按 `cardId + importId` 从随包目录借用缩略图地址，不修改当前应用牌库；若没有有效缩略图地址或文件不可用，条目显示缺图占位，不将完整图用于裁切。桌面通过受限 `cards:fetch-image` IPC 和 `net.fetch` 下载原图，规避 CORS，按文件签名纠正源站 AVIF 的 octet-stream MIME；浏览器预览保留图片代理。

设置页 `CardCacheManager` 用 `localforage.keys()` 枚举缓存文件，按当前牌库核对每张卡的中文大图/缩略图。两者齐全记为已缓存，任一有持久失败记录记为缓存失败，其余记为未缓存；清单不发起图片请求，预览只读取当前页的本地图片。紧凑预览每行最多 10 张卡，每张卡右上角的删除按钮同时移除其完整图、缩略图和失败记录，不再列出历史地址及旧缓存的逐文件清单。失败记录以 URL 为键保存错误与时间，成功下载后清除。最近批量范围会跨页面持久化；设置页可按范围搜索和分页，并继续缓存未缓存项或重试失败项。汇总按当前牌库中已缓存的卡牌去重计数，大图与缩略图分别统计；未使用的旧地址及其他语言缓存不计入当前覆盖数，保留显式清理。图片 API、批量队列及缓存批次不再携带语言参数，多语言文字与属性数据保持原样。缓存键变化通知通过合并事件刷新已打开的清单。普通图片缓存、失败清单和批次范围均排除在用户备份之外，卡组图片仍依旧纳入备份。

批量下载由模块级队列调度，默认每卡间隔 500ms、1 个并发卡牌任务；浮窗加减按钮可即时调整间隔（100ms–30s）和线程数（1–8）。同一卡的完整图与缩略图并行补齐，界面显示当前卡名和未完成的图片类型。所有任务共享启动间隔及连续失败退避，最高等待 30s；已有缓存不重置失败计数，重试延续持久失败次数。暂停及缩减线程不会中断已发出的图片请求；主动暂停从速度和剩余时间估算中扣除，卡间等待计入。

详情展示新数据的费用、攻防、关键词、永久卡池、预备状态及 `BecomesVeteran:` / `VeteranOf:` / `can_create` 关联；未识别的关键词保留源字段。`attributes` 中 `OnlySpawnable` 也出现在可升老兵的原卡上，不能据此排除构筑；仍依据 `set` 为 OnlySpawnable/Special 判断衍生形态。第 50 步兵团原卡 lV 为 2/1 费用、3/2，老兵 Cr 为 2/1 费用、4/3、伏击，二者卡名相同，显示层为老兵追加标记。

## 规则与卡组码

构筑展示卡池独立于规则提示：主国卡全显示，盟国隐藏 Elite，排除 OnlySpawnable/Special 扩展包（与 Special 稀有度区分）。主盟国相同时主国条件优先，中立牌及其他国家不展示。导入或已保存的卡组条目原样保留，筛选不删除卡牌。文字搜索、类型、费用（含 7+）、稀有度、扩展包和状态共用 `matchesCardFilters`。

构筑通过 `onPreview` 调用 App 现有生成与预览管线，传递当前卡组码、名称，复用主页背景、缓存、下载和弹窗。生成请求用序号标记，关闭后忽略迟到结果。对话框键盘服务管理首焦点、回车确认、Esc、Tab 循环和异步禁用触发按钮后的焦点恢复；页面级快捷键避开已处理事件及 IME 组词。

标准预设：39 张可用牌（加总部共 40），普通/限定/特殊/精英上限 4/3/2/1，盟国牌上限 12，提示预备和衍生牌。纯主国牌组可使用相同主盟国。

竞技场本地预设：39 张可用牌，放宽稀有度数量和预备卡限制；不包含选秀过程和活动特殊规则。预设用于本地辅助校验，后续需随官方规则维护，用户也可切换自定义规则。

未知卡保留编号和数量。超四张沿用原构筑器的重复四张区段编码方式，规则只提示；最终游戏可能拒绝不合法卡组。

## 后续接口

- 按 ID 缺卡补全：后续接入同一手动获取与校验边界，不静默更新牌库。
- 卡牌直检：独立缓存探测结果，不自动写入主牌库；本地缺牌提示手动补全。
- 二维码：共享卡组码模块，单独接入编解码库，不复制远程生成服务。
- 娱乐：共享卡池筛选与卡牌模型，区分官方模拟与用户自定义池。
- 卡面修正与总部：用户覆盖层优先，独立备份，不改官方记录。

## 自定义筛选与悬浮面板（0.3.2）

`CustomSelect.tsx` 提供单选/多选、键盘导航、选中态、分组、点击外部关闭及视口定位。弹层挂载到 body，避免资料库、构筑侧栏和模态窗口的 overflow 裁切。`CardFilterSelects.tsx` 共享图标、中文/英文选项、费用和扩展包顺序；`CardFilters` 的阵营/类型/费用/稀有度为数组，空数组代表不限，组内 OR、组间 AND。构筑仍额外受主盟国卡池限制。

`public/assets/filters/` 保存 36 份本地图标和逐项来源清单。`scripts/import-filter-icons.py` 从本地 MHTML 提取内联 SVG，并获取用户指定的扩展包资源；此脚本仅用于维护，运行时不会联网获取图标。未来未知扩展包仍显示数据 ID 和通用图标。

卡组详情保留 App 内原有编辑/管理逻辑，以 `selectedDeckId` 控制非模态绝对定位浮层；关闭时清空选中并恢复到触发卡组按钮的焦点。网格/收藏夹始终使用完整工作区宽度，只有真实模态对话框会阻止页面级 Esc。内部标签编辑与选择框先消费事件，避免误关详情。
