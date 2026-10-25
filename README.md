# KARDS 本地军械库

整合三个参考项目的个人 Windows 桌面工具。当前版本为 **0.2.0 开发版**，已完成本地牌库、构筑、卡组管理和卡图批量缓存的完整主流程；V1 全部功能见 [需求文档](docs/product-requirements.md)。

## 已实现

- 随包提供 1,646 张多语言卡牌资料，支持名称/文本搜索与阵营、类型、费用、稀有度、扩展包、状态筛选。
- 多语言文字、v40–v54 卡图选择；首次查看卡图可联网缓存，历史版本仅改变图片。
- 手动构筑、草稿保存、卡组码导入/导出，未知卡 ID 与超限数量保留并提示。
- 标准/竞技场/自定义校验，允许带提示保存、导出；39 张可用牌另加总部。
- 卡组保存和继续编辑、重命名、收藏、标签、备注、合集、用户数据备份恢复。
- 卡组列表单击显示右侧紧凑卡牌清单，双击进入编辑；卡组图片复用 Kardsman 的 Sharp 十列布局，完全本地生成 PNG。
- 资料库可批量缓存当前筛选的全部卡图；大批量下载会确认，任务跨页面运行并在右下角显示进度、速度、预计剩余时间、失败重试。
- 资料库与构筑使用完整卡面比例；构筑卡图下显示按稀有度着色的携带数量方块。
- 继承桌布、卡背、深浅主题及界面设置；侧栏与浮窗统一毛玻璃效果，暗色模式自动使用白色 KARDS 标志。
- 对话框支持 Enter 确定、Esc 关闭/取消，支持焦点恢复和键盘循环。

尚未实现：二维码、手动增量同步/缺卡补全、英文联网直检与变体/老兵探测、开包/随机抽卡、单卡卡面修正及总部卡面。完整状态见 [开发路线图](docs/development-roadmap.md)。

## 开始运行

直接试用开发包：解压 `release/KARDS Local Arsenal-0.2.0-win.zip`，启动其中的 `KARDS Local Arsenal.exe`，保留解压目录内的全部文件。运行开发包无需安装 Node.js。

从源码开发：

需要 Windows、Node.js 22 LTS（含 npm）。

```powershell
npm install
npm run dev:desktop
```

只调试界面可运行 `npm run dev:renderer` 并打开 http://127.0.0.1:5173 。应用本身无需 API Key 或在线出图服务。

```powershell
npm run lint
npm test
npm run build:desktop
npm run dist:win:zip
```

更多说明见 [构建与运行](docs/build-and-run.md)、[架构与复用](docs/architecture.md)、[第三方来源](THIRD_PARTY_NOTICES.md)。

本轮可直接运行 `release/win-unpacked/KARDS Local Arsenal.exe`，请保留整个文件夹。类型检查、单测、离线界面流程、生产 Electron、生图 Sharp 和打包 EXE 测试已通过，详见 [开发记录](docs/development-status.md)。

`references/` 保存原始项目供查阅，不参与编译。`openspec/` 是继承自 Deck Collector 的历史设计，当前开发以 `docs/` 为准。卡牌资料和图片属于 KARDS 各自权利人，本工具为非官方项目。
