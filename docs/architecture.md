# 项目架构

## 技术与运行边界

React 19、TypeScript、Vite 和 Tailwind CSS 4 构成渲染端，Electron 提供 Windows 桌面能力。卡组、设置与牌库快照通过 localforage 保存在 IndexedDB。Sharp 负责桌面图片生成，浏览器预览使用 Canvas。

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
| `src/components/DeckImagePage.tsx`、`src/lib/deckImageCache.ts` | 卡组生图快捷页、剪贴板自动填充、双预览及按现有图片缓存发现历史记录 |
| `src/components/DeckImageHistoryItem.tsx`、`src/lib/deckRenderHeader.ts` | 可见历史项的双缩略图、旧缓存迷你图补全；Canvas 与 Sharp 共用的费用柱状图、分类饼图及标题布局 |
| `src/components/CardLibrary.tsx` | 卡牌筛选、分页、总部堆叠与资料详情 |
| `src/lib/deckCover.ts` / `src/lib/deckMiniRenderer.ts` | 战备封面与迷你分享图共用统计及代表卡选择；本地 Canvas 导出带元数据二维码的 PNG |
| `src/components/HeadquartersGallery.tsx` | 无底板的总部散开与反向收回，支持中途关闭，到位后显示国家标题 |
| `src/components/CardPacks.tsx`、`cardPacks.css` | 国家/扩展包选择、标准/军官包切换、发牌与翻牌、本次结果和详情 |
| `src/lib/cardPacks.ts` | 非衍生来源卡池、两种规格的基础概率、保底补足与翻卡时序 |
| `src/lib/usageTips.ts`、`src/components/CardBrowsingTip.tsx` | 使用提示的 localStorage 持久关闭及跨组件恢复 |
| `src/components/DeckBuilder.tsx` | 构筑会话、增减牌、规则、历史记录及保存 |
| `src/components/DeckCardStrip.tsx` | 国家底色卡牌条、费用、缩略图、数量及悬浮预览 |
| `src/components/CardDetailModal.tsx` | 卡牌详情、来源位置动画；`useCardDetailPaging.ts` 管理滚轮切卡与首尾回弹，`cardDetailPaging.ts` 同步来源定位 |
| `src/components/TableclothBackground.tsx` | 桌布双层淡入淡出，保持工作区内容独立 |
| `src/components/DeckCardMotion.tsx` | 构筑加减牌、撤回/重做的飞行动画和数字反馈 |
| `src/components/CardDataUpdater.tsx` | 数据源选择、获取、差异预览、应用与回退 |
| `src/components/CardCacheManager.tsx` | 缓存分类、覆盖统计、预览、重试与删除 |
| `src/lib/cardData.ts`、`cardDatabase.ts`、`cardDataSync.ts` | 卡牌数据校验、持久化和跨页面同步任务 |
| `src/lib/cardImages.ts`、`cardImageDownload.ts`、`imageDownloads.ts` | 图片缓存、下载校验及后台队列 |
| `src/lib/deckCode.ts`、`deckImport.ts`、`deckRules.ts`、`deckAnalysis.ts` | 卡组码、导入、构筑规则及五项能力评分；`src/data/deckAnalysis.json` 保存审查数据与固定样本区间，未标注或卡文更新时使用印刷属性与常见效果估算 |
| `src/lib/cardFilters.ts`、`cardPoolLayout.ts` | 共享筛选语义与自适应分页布局 |
| `src/lib/useDeckGridLayout.ts` | 复用网格尺寸计算，以较窄的缩放范围适配卡组主页，保留纵向滚动及用户缩放设置 |
| `src/lib/cardKeywords.ts`、`cardSort.ts` | 词条读取 `src/data/cardKeywords.json` 统一清单，派生 16 个属性词条、7 个战斗词条及全部文字强调；牌库主排序及费用、类型次级排序 |
| `src/components/PageIndicator.tsx`、`src/lib/pagination.ts` | 共用首尾页、邻近页及省略号导航，支持点击与键盘；滚轮翻页由卡池区域负责 |
| `src/data/cardSubtypes.json`、`src/lib/cardSubtypes.ts` | 本地子类定义、卡牌映射及详情展示 |
| `src/lib/deckRenderer.ts`、`deckRenderCounter.ts` | Canvas 生图及共享计数器绘制 |
| `src/lib/deckImageCode.ts`、`deckImageQr.worker.ts`、`deckImageImport.ts` | 含卡组名、总部和卡背标识的二维码载荷、后台识别及卡名文字匹配 |
| `electron/windowsOcr.ts` | 本机 Windows OCR，图片转换、临时文件清理与超时限制；通过受限 IPC 返回文字 |
| `src/lib/cardAssets.ts`、`src/data/` | 卡背、总部、桌布和战备卡组清单 |
| `src/lib/backup.ts` | 用户备份的校验、导出和恢复 |
| `src/lib/userDataSchema.ts`、`userDataStorage.ts` | 用户数据结构校验、串行保存、失败重试、自动备份与备份恢复日志 |
| `src/lib/packHistory.ts` | 开包累计次数、模拟花费及含万能牌的稀有度统计 |
| `src/types/` | 卡牌模型、桌面接口及类型定义 |
| `electron/main.ts`、`preload.ts` | 窗口、受限 IPC、本地协议及桌面能力 |
| `electron/deckRenderer.ts` | 使用本地资源和已缓存卡图生成 PNG |
| `public/data/cards.json` | 安装时提供的只读卡牌快照 |
| `scripts/` | 构建、启动、打包辅助及交互验证脚本 |

## 卡牌数据更新

设置中选择 `kardsplayer` 或 `kardscom` 来源，调用共享分页与校验逻辑。桌面经 `cards:fetch-page` IPC 请求固定 GraphQL 端点，浏览器使用同样的数据模型；不向渲染端开放任意网络代理。

```text
手动获取 → 分页及完整性校验 → 候选快照 → 新旧差异 → 用户应用
                                              ↓
                                      当前快照 / 上次快照
```

完整获取后按 `importId` 比较新增、修改和移除，多语言文本逐字段比较。获取、应用和回退先完成持久化，再切换内存数据；取消、网络错误或写入失败不会覆盖当前牌库。任务位于模块级状态中，切换页面不终止获取。

图片地址属于卡牌数据；获取牌库不下载图片，应用数据也不清理现有图片缓存。卡名相同的原卡、老兵卡等记录按各自标识独立保存。完整牌库校验时按 `VeteranOf` 关联将老兵卡的 `Special` 扩展包替换为本体扩展包，覆盖随包数据、已存快照及后续获取；衍生判断独立检查老兵关联，避免扩展包归一化后进入构筑卡池。

本地天气清单补齐变体和生成关系，基础天气卡保留来源数据及图片地址；加载旧快照时修复曾被补充数据覆盖的基础天气图片地址。

## 图片缓存与后台下载

卡图统一使用中文完整图和缩略图，多语言卡牌文字仍用于搜索和详情。每种图片以卡牌编号及实际 URL 组成独立缓存键，URL 改变后可下载新文件，旧缓存保留以支持数据回退。

- 查看或批量缓存一张卡时，同时补齐完整图与缩略图；失败重试只下载缺项。
- 卡牌条读取独立缩略图，悬浮大图及生图读取完整图；不以整图裁切冒充缩略图。
- 天气变体跟随原体的最新缩略图地址，共用原体缩略图缓存与并发下载；完整卡图仍各自保存。更新或载入牌库时自动修正旧变体缩略图地址。
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
| 开包累计历史 | `kards_pack_history_v1` | 包含 |
| 设置、分类与用户图片 | `kards_settings` 等用户存储键 | 包含 |
| 桌面完整图与缩略图 | 由桌面缓存接口管理 | 不包含 |
| 浏览器完整图与缩略图 | IndexedDB 的 `kards_card_image_v2_` 前缀 | 不包含 |
| 下载失败与最近批次 | `kards_card_image_failures_v1`、`kards_card_image_batch_v1` | 不包含 |
| 卡组生图缓存 | `deck_img_local_v1_` 前缀 | 包含 |
| 迷你分享图缓存 | `deck_img_mini_v1_` 前缀 | 包含 |

用户数据目录固定为 `%APPDATA%\kards-toolbox`，不查找旧目录；测试可用 `--user-data-dir` 隔离。用户备份不能覆盖独立管理的卡牌数据库和普通卡图缓存。

用户数据初始化先完整读取、校验并创建启动快照，再开放自动保存；任一项读取失败时保留原值并显示恢复入口。卡组、设置、草稿和开包历史的写入经共享队列串行执行；自动保存失败保留待重试值并显示全局提示，构筑的显式保存等待实际写入成功后才退出。备份导出等待队列，存在未保存修改时拒绝导出过期数据。

`kards_user_auto_backups_v1` 保留最多 3 份不同用户快照，记录启动或恢复前的数据，不包含可重建的卡组图片；设置可选时间点恢复。导入先校验全部键和值，再保存原值至 `kards_user_restore_journal_v1` 后逐项替换。任何写入失败都会按日志回滚；回滚未完成时阻止其他自动写入，下一次初始化优先恢复原数据。自动快照及恢复日志不递归进入用户导出文件。

## 构筑、资源与界面

卡组码使用共享编解码模块；总部由显示层补入总数，不占用可用牌记录。规则校验与卡池筛选分开：主国和盟国卡池限制决定候选，规则决定提示；已有或未知卡不因筛选被删除。

卡池按可见宽高在预设尺寸范围内选择完整行列，不纵向滚动；容器变化时重新计算，滚轮驱动分页；末页不向前补齐。资料库与构筑共用文字、类型、子类、费用等筛选语义；文字中的“.”匹配任意单个 Unicode 字符，其余正则符号转义后按字面匹配；中文本地化卡名另做去空白、标点和符号的匹配，描述及其他语言不参与这种归一化。`x` 加三/四位数字进入单位数值搜索模式，分别匹配部署/攻击/防御或部署/行动/攻击/防御，各指定数值需为 0–9 整数；与现有筛选组合。搜索表达式只在查询改变时重新编译。子类图标由 `assets.json` 的 `subclasses` 映射统一管理；词条可按“和/或”匹配，资料库带筛选搜索且结果不超过 3 张时，分别计算只保留文字、只保留筛选的结果数量，有结果才提供对应入口，由用户点击后应用；子类映射与官方卡牌数据分开维护。

牌库主排序相同时，依次按费用、类型（步兵、炮兵、坦克、轰炸机、战斗机、指令、反制指令）升序排列，最后保留原数据顺序。末级排序以天气原体的位置作为该组位置，并按原体、变体 1、变体 2 排列；不修改其费用、类型或战斗属性。筛选隐藏原体时仍保持变体顺序。

资料库详情模式保存在 `kards_settings.cardDetailMode`，支持共享 modal 与原有侧栏。构筑单击立即打开详情，弹窗捕获原点击位置的第二次点击以完成双击加牌，不再为区分单击与双击延迟开窗。卡组详情对卡组按钮的点击单独处理，重复选择当前卡组不触发关闭重开。

卡背、总部及桌布由 JSON 清单管理适用国家、名称、图片及关联关系。选中卡组可临时切换总部桌布，退出后恢复用户设置；生图中的桌布选择仅影响本次导出。生图读取本地缓存，缺图显示占位，不依赖在线出图服务。

资源路径集中维护于 `src/data/assets.json`（阵营、类型、稀有度、扩展包、预备标志、品牌图标、万能卡、卡包）及 `cardbacks.json`、`headquarters.json`、`tablecloths.json`，界面与生图共用清单。`assetCatalog.ts` 负责按用途选择图标：筛选和计数器使用阵营白色图标；战斗机、轰炸机的详情及卡牌条使用空军图标，缺失时回退普通图标；其余使用普通图标。reserved/reversed 阵营变体不加入清单。万能卡按通用及五主国、稀有度登记，战备卡组只使用通用组；卡包记录文件、显示名称、来源分类、国家列表或扩展包 ID，以及标准/军官规格，选包界面与卡池计算共用清单。

桌布清单维护默认项、显示名称、壁纸国家和总部关联；壁纸国家用于分类，不限制用户选择。壁纸通过 cardId 关联卡牌中文名，通用步兵画面使用已有类型名；已改名的卡背、默认桌布和壁纸保留旧地址映射，已删除的桌布回退到木纹默认项。

总部名称、英文名、简介与历史集中维护在 `src/data/headquarters.json`。清单的 `id` 和 `groupId` 保持稳定，以兼容已保存卡组及专属桌布关联。

界面颜色、间距、浮层与动画约定见 [界面规范](../DESIGN.md)。包依赖仍由 npm 管理；`scripts/collect-licenses.cjs` 在网页及完整缓存构建时从已安装生产依赖收集许可文本，桌面打包附带项目与第三方声明。依赖自带许可证与 Electron 运行时许可证随各自组件保留；游戏内容的权属范围见 [第三方说明](../THIRD_PARTY_NOTICES.md)。

词条唯一清单位于 `src/data/cardKeywords.json`：`label` / `english` 管理中英对照，`icon` 指向可选词条图标（动员使用 `mobilize.png`，老兵使用 `veteran.png`）；PNG 保留真实透明空白与抗锯齿边缘，避免半透明底层形成灰色矩形，`attribute` 标识属性词条，`highlighted` 标识战斗词条；战斗词条属于属性词条，属性词条属于完整词条表。`numbered` 声明重甲/情报的数值后缀，`attributeAliases` 管理属性别名及详情可见性，`excludeFollowing` 避免“战斗”命中“战斗机”。`filterGroup` 管理三列筛选分类及排列顺序，`descriptionPrefix` 匹配描述中的“词条：”形式，`cardIds` 维护倒计时卡名单，`textMatch: false` 排除纯筛选项目的正文匹配。筛选菜单、详情属性与中英文规则文字加粗均由该清单派生；战斗强调色只用于筛选项与详情的词条信息，规则正文仅加粗。

卡组生图快捷页在进入和窗口重新获得焦点时读取剪贴板；同一次页面会话中，相同剪贴板卡组码不会重复覆盖手动输入。有效输入停止 350ms 后并行生成完整图与迷你图，过期请求不会替换新预览。图片放大通过 Portal 复用详情遮罩和模态键盘处理；历史侧栏沿用卡组详情浮栏布局，只枚举完整图缓存键，可见记录读取图片后缩为小图，旧缓存缺少迷你图时补生成。完整图重绘会先清除旧迷你缓存，迷你图写入等待完整图保存成功，避免标题、总部或桌布更新后配对错误。该页面不创建卡组。

完整生图由 `summarizeDeckCosts` 计算含实际张数、不含总部的费用和类别统计，随 `DeckRenderRequest.statistics` 传给桌面；两种渲染器共用 `deckStatisticsSvg`，饼图颜色与卡组分析都读取 `DECK_COST_CATEGORIES`。背景在合成清晰卡牌与数据前单独模糊和压暗。

## 模拟开包

`assets.json.cardpacks` 登记 14 种来源、每种 2 种规格，共 28 张资源图。国家包按 `nations` 匹配（盟国包为五盟国合集），扩展包按 `set` 匹配；排除衍生、老兵及无标准稀有度记录，允许一包内重复卡。

`PACK_RULES` 按普通/限定/特殊/精英记录单卡基础概率：标准包 74.6/19.9/4/1.5，军官包 50.6/32.1/12.4/4.9。`PackReward` 区分实际卡牌与通用万能牌，避免将模拟万能牌写入真实牌库。军官包的每个可用稀有度桶增加一份通用万能牌，与桶内每张卡牌占据相同抽取区间；标准包不增加万能牌。抽取后，标准包补足至少 1 张限定或以上，军官包补足至少 2 张限定或以上和至少 1 张特殊或以上，保底候选沿用相同的卡牌/万能牌结果池；始终保留 5/7 张。缺失稀有度时只在可用稀有度间归一化，无法满足保底时停止并提示更新数据。

翻卡由原生 Web Animations API 控制，依次抬升、翻转、落下，稀有度决定持续时间和局部冲击反馈；退回、离页和重新开包会清理旧动画。缩减动态效果模式保留短促状态切换。单包明细仅保存在当前会话；累计标准/军官次数及各稀有度张数保存在 `kards_pack_history_v1`，在一次成功开包时写入，写入成功后才展示结果，翻牌和返回不重复计数。按 100/330 计算模拟花费；顶栏复用迷你分享图的通用万能牌小图统计，包含真正抽到的万能牌。万能牌使用通用卡背及本地 Common 资源，不调用真实卡图下载或牌库详情接口；完整卡牌图沿用共享缓存及配套缩略图下载。
