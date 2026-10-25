# 第三方来源

本整合工程主要复用以下本地参考项目，原始副本位于 `references/`。

- **Kards-Deck-Collector**：根工程 React/Electron、资产、存储与管理交互来自该项目。源文件保留 SPDX `Apache-2.0` 标识。参考副本未附独立 LICENSE 文件；正式分发前需补齐其上游许可与作者信息。
- **kards-image-tool / 百年匠魂 CraftSoul**：卡牌快照、卡图路径及卡组码算法参考、澳新资源。项目许可证为 MIT，完整文本保存在 `third-party/kards-image-tool-LICENSE.txt`。
- **koishi-plugin-kardsman**：适配其 MIT 许可的 Sharp 卡组渲染布局（十列卡牌、重复卡牌、总部槽位、标志和稀有度统计），以及 GraphQL 分页获取和同步思路。卡牌更新改为完整获取后逐字段对比、显式应用与可回退快照；未带入 Koishi 命令、定时器或卡图同步逻辑。package.json 声明 MIT，作者/许可信息以参考项目为准。其完整卡图目录未复制进本工程。

KARDS 名称、卡牌数据、插画、卡背、旗帜及桌布等游戏内容属于相应权利人；上述代码许可不代表这些内容的权利转让。保留参考项目的权利说明；本工具为非官方个人使用工具。

npm 依赖各自许可见其包内 LICENSE 与 lockfile；Electron 打包亦保留其许可证文件。
