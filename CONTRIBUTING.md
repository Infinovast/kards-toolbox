# 参与贡献

[中文](CONTRIBUTING.md) | [English](CONTRIBUTING_en.md)

感谢您的贡献。欢迎提交问题反馈和 Pull Request。功能与使用说明见 [README](README.md)，环境、资源准备及构建命令见 [构建与运行](docs/build-and-run.md)，代码结构见 [项目架构](docs/architecture.md)。

## 提交修改

1. 安装 Node.js 22 与 npm，执行 `npm ci`。桌面运行和资源相关检查还需要自行准备有权使用的静态资源。
2. 将修改控制在一个明确问题或功能内，说明复现步骤、预期行为和实际结果；界面问题可附已去除个人信息的截图。
3. 提交前运行 `npm run lint`、`npm test` 与 `npm run build:desktop`，并说明未能执行的检查及原因。不要提交依赖目录、构建产物、缓存、用户备份、密钥或游戏资源包。
4. 新功能只递增一次补丁版本，同步 `package.json`、锁文件根版本及根包版本、README 当前版本，中英文 README 保持一致；修复、样式调整和文档整理不改版本。

文档只描述现行实现：README 记录使用方式，`docs/build-and-run.md` 记录开发构建，`docs/architecture.md` 记录架构，`DESIGN.md` 记录界面规范。中英文文档应同步维护。

提交贡献应确保有权提供相关代码和内容。自行编写的贡献沿用项目 MIT 许可证；引入第三方内容时，保留其版权和许可证并更新中英文 [第三方说明](THIRD_PARTY_NOTICES.md)。请勿以 MIT 许可证提交未获授权的游戏素材。

敏感漏洞请按 [安全问题反馈](SECURITY.md) 处理。
