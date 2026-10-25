# 架构与复用说明

## 当前结构

```text
src/App.tsx                  桌面导航、卡组/收藏夹、全宽设置、用户备份入口
src/components/CardDataUpdater 卡牌数据获取、差异筛选与逐字段预览、应用/回退
src/components/CardLibrary  本地目录筛选、多语言、卡图版本和单卡详情
src/components/DeckBuilder  构筑会话、草稿、规则配置、保存与导出
src/types/card.ts           三项目共享卡牌记录、语言/阵营、快照读取
src/lib/deckCode.ts         共享卡组码解码与编码（1/2/3/4 张区段）
src/lib/deckRules.ts        可配置规则校验，只提示不阻止保存
src/lib/cardFilters.ts      资料库/构筑共享筛选与构筑主盟国卡池边界
src/lib/cardImages.ts       语言/版本/卡牌分键缓存、下载与请求去重
src/lib/cardData.ts         官方固定 GraphQL 查询、分页校验、多语言逐字段差异
src/lib/cardDatabase.ts     独立牌库快照的原子持久化
src/lib/cardDataSync.ts     跨页面获取任务、候选/应用/回退状态
src/lib/deckRenderer.ts     本地 Canvas PNG，读取缓存、不请求网络
src/lib/backup.ts           用户备份格式与读写
public/data/cards-v54.json  随包牌库快照
electron/main.ts            窗口、本地资源协议、固定牌库请求、剪贴板和文件对话框
electron/preload.ts         受限桌面桥接
```

React 19 + TypeScript + Vite + Tailwind CSS 4，Electron 桌面壳。保留 Deck Collector 的 localforage 存储与界面系统，避免同时启动三个独立应用。渲染端关闭 Node 集成，开启 context isolation。

## 功能来源与改造

| 参考项目 | 复用内容 | 本轮处理 |
| --- | --- | --- |
| Kards-Deck-Collector | React 桌面壳、Electron、卡组/合集、收藏、标签、卡背、桌布、主题、备份 | 作为根工程；加入资料库和构筑导航、备注、编辑连接；移除远程出图与 TLS 绕过配置 |
| kards-image-tool | 多语言 `data.json`、阵营编码、按拷贝数分组的卡组码、稀有度上限、卡图 URL、Canvas 思路 | 直接复制快照和澳新资源；将代码逻辑改为共享 TS 模块及 React 页面；本地渲染器为整合后重写 |
| koishi-plugin-kardsman | GraphQL 分页/同步思路、Sharp 渲染 | 已适配十列 Sharp 渲染及手动分页获取；完整取回后逐字段比较，显式应用/回退。不带入 Koishi 命令、定时器或图片同步；按 ID 补全尚未实现 |

保留原始项目供核对。所有实际改动在根工程，`references/` 不参与 TypeScript 检查、打包或根仓库版本管理。

## 本地数据边界

- `public/data/cards-v54.json`：只读首发文字快照；历史卡图版本不改变这份资料。
- `kards_card_database_v1`：独立可写牌库，包含 `schemaVersion: 1`、当前 `active`、上次 `previous`、待确认 `pending` 快照及 `lastCheckedAt`。每份快照保留数据、来源、获取/应用时间；不纳入用户备份。
- `kards_decks` / `kards_collections`：用户卡组及收藏夹；保留旧合集的存储键和字段，界面改为列表内可展开分组。新增 `notes`、规则集和自定义规则字段，兼容旧卡组。
- `kards_builder_draft`：当前构筑会话，自动保存，纳入用户备份。
- `kards_settings`、`kards_custom_categories`、桌布键：继承的用户设置和图片。
- `kards_card_image_v1_{version}_{language}_{importId}`：独立卡图缓存，不纳入用户备份。
- `deck_img_local_v1_{code}`：本地卡组图片缓存，纳入备份。每次生成重新读取现有卡图，避免永远停留在缺图状态。

用户备份格式仍采用 schemaVersion 1，接受原 `kards-deck-collector` 和 `kards-local-tool` 标记，新备份使用 `kards-toolbox`。卡牌库和普通卡图缓存不能由用户备份覆盖。

应用对外名称为 KARDS Toolbox（KARDS 工具箱）；安装应用 ID 保持不变。默认用户目录使用新名称，但若旧中文/英文/包名目录已存有 IndexedDB 且新目录没有数据，会继续使用旧目录；显式 `--user-data-dir` 不受此兼容处理影响。

## 手动牌库更新

左栏上部连接卡组与卡牌，底部为桌布和设置。设置是全宽工作区页面，打开页面只读取本地状态，不请求官方数据。

用户点击获取后，桌面端通过 preload 的 `fetchCardDataPage(offset)` 调用固定 `cards:fetch-page` IPC，主进程使用 `electron.net.fetch` 请求 `https://herokuapi.kards.com/graphql`；浏览器预览直接请求同一接口。端点与查询固定，不允许渲染端指定任意 URL。每页 100 张，包含衍生、放逐与预备卡，分页间隔一秒；查询不包含卡图字段。

参考 Kardsman 的分页思路，但不采用“总数相同就跳过”的策略。完整数据经类型、唯一编号、分页计数与完整性校验后，按 `importId` 比较新增/修改/移除。多语言逐字段展开，忽略 JSON 键顺序和根级 API 记录数字 ID；统一重复的 `reserved` 字段。获取任务保存在模块级 external store，切换页面不中断，取消或失败不会替换当前数据。

获取只写入候选快照，应用后才切换共享牌库并重新计算卡组规则提示。当前、候选和回退数据写在同一个 IndexedDB 值内，写入失败不会出现半应用状态；应用失败保留候选，允许重试。回退同样先持久化成功，再切换界面。启动优先读取已应用快照，否则使用随包 v54。未知卡仍保留卡组码和数量，以编号显示。

牌库更新不下载、清空或替换卡图；即使资料中的卡图路径变化，也保留已有按语言/版本分键的缓存。图片下载继续由资料库现有按需或批量缓存功能管理。

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
