# 架构与复用说明

## 当前结构

```text
src/App.tsx                  继承的桌面导航、卡组/合集、外观、用户备份入口
src/components/CardLibrary  本地目录筛选、多语言、卡图版本和单卡详情
src/components/DeckBuilder  构筑会话、草稿、规则配置、保存与导出
src/types/card.ts           三项目共享卡牌记录、语言/阵营、快照读取
src/lib/deckCode.ts         共享卡组码解码与编码（1/2/3/4 张区段）
src/lib/deckRules.ts        可配置规则校验，只提示不阻止保存
src/lib/cardImages.ts       语言/版本/卡牌分键缓存、下载与请求去重
src/lib/deckRenderer.ts     本地 Canvas PNG，读取缓存、不请求网络
src/lib/backup.ts           用户备份格式与读写
public/data/cards-v54.json  随包牌库快照
electron/main.ts            窗口、本地资源协议、剪贴板和文件对话框
electron/preload.ts         受限桌面桥接
```

React 19 + TypeScript + Vite + Tailwind CSS 4，Electron 桌面壳。保留 Deck Collector 的 localforage 存储与界面系统，避免同时启动三个独立应用。渲染端关闭 Node 集成，开启 context isolation。

## 功能来源与改造

| 参考项目 | 复用内容 | 本轮处理 |
| --- | --- | --- |
| Kards-Deck-Collector | React 桌面壳、Electron、卡组/合集、收藏、标签、卡背、桌布、主题、备份 | 作为根工程；加入资料库和构筑导航、备注、编辑连接；移除远程出图与 TLS 绕过配置 |
| kards-image-tool | 多语言 `data.json`、阵营编码、按拷贝数分组的卡组码、稀有度上限、卡图 URL、Canvas 思路 | 直接复制快照和澳新资源；将代码逻辑改为共享 TS 模块及 React 页面；本地渲染器为整合后重写 |
| koishi-plugin-kardsman | GraphQL 分页/增量同步、缺卡补全、本地图维护、Sharp 渲染 | 已分析并确定复用点；本轮尚未迁入运行代码。后续提取同步服务，不带入 Koishi 命令和自动更新定时器 |

保留原始项目供核对。所有实际改动在根工程，`references/` 不参与 TypeScript 检查、打包或根仓库版本管理。

## 本地数据边界

- `public/data/cards-v54.json`：只读首发文字快照；历史卡图版本不改变这份资料。
- `kards_decks` / `kards_collections`：用户卡组及合集；新增 `notes`、规则集和自定义规则字段，兼容旧卡组。
- `kards_builder_draft`：当前构筑会话，自动保存，纳入用户备份。
- `kards_settings`、`kards_custom_categories`、桌布键：继承的用户设置和图片。
- `kards_card_image_v1_{version}_{language}_{importId}`：独立卡图缓存，不纳入用户备份。
- `deck_img_local_v1_{code}`：本地卡组图片缓存，纳入备份。每次生成重新读取现有卡图，避免永远停留在缺图状态。

用户备份格式仍采用 schemaVersion 1，接受原 `kards-deck-collector` 标记，新备份使用 `kards-local-tool`。卡牌库和普通卡图缓存不能由用户备份覆盖。

## 规则与卡组码

标准预设：39 张可用牌（加总部共 40），普通/限定/特殊/精英上限 4/3/2/1，盟国牌上限 12，提示预备和衍生牌。纯主国牌组可使用相同主盟国。

竞技场本地预设：39 张可用牌，放宽稀有度数量和预备卡限制；不包含选秀过程和活动特殊规则。预设用于本地辅助校验，后续需随官方规则维护，用户也可切换自定义规则。

未知卡保留编号和数量。超四张沿用原构筑器的重复四张区段编码方式，规则只提示；最终游戏可能拒绝不合法卡组。

## 后续接口

- 同步服务：只由明确用户操作触发，更新独立可写目录/存储；先校验新快照，成功后替换；失败保留旧数据。
- 卡牌直检：独立缓存探测结果，不自动写入主牌库；本地缺牌提示手动补全。
- 二维码：共享卡组码模块，单独接入编解码库，不复制远程生成服务。
- 娱乐：共享卡池筛选与卡牌模型，区分官方模拟与用户自定义池。
- 卡面修正与总部：用户覆盖层优先，独立备份，不改官方记录。
