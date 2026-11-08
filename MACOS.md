# 知枝 · Apple Silicon 安装与发布

目标系统：macOS 14 或更新版本，Apple Silicon（M 系列）。不提供 Intel Mac 兼容声明。

## 安装与启动

从本项目的 GitHub Releases 下载 `Zhizhi-版本-macos-arm64.pkg`，完成安装后，从“应用程序”打开 **Zhizhi（知枝）**。应用内置 ARM64 Node.js 24.16.0 与生产依赖，不需要另装 Node、npm 或 Homebrew。1.2.0 起直接打开独立应用窗口，不会启动浏览器。未连接时，右上角有「连接到 Agent」入口。

当前构建默认没有 Apple Developer ID 签名与公证，不能冒称为 Apple 已验证的安装包。macOS 可能要求通过“系统设置 → 隐私与安全性”为这个包单独确认打开；不要关闭 Gatekeeper、SIP 等系统保护。正式免提示分发需要项目所有者提供 Developer ID Application、Developer ID Installer 和公证凭据。

## 数据、密钥与升级

- 知识图与配置：`~/Library/Application Support/Zhizhi`。
- API Key：Mac 登录钥匙串中的本应用专属条目，配置文件只保留随机引用，不记录明文。
- Windows DPAPI 密钥不能跨账户/跨系统解密；请在 Mac 重新填写 API Key。知识图可使用 JSON 导入迁移。
- Codex 与 Claude Code 使用本机官方客户端登录。查找 PATH、`~/.local/bin`、`~/.cargo/bin`、Homebrew 与 Codex 应用内可执行文件；没有安装时不会显示连接成功。
- 点击设置底部“检查更新”，下载新 pkg；先退出知枝，再安装。安装只替换 `/Applications/Zhizhi.app`，不清理用户数据。
- 关闭应用窗口或退出知枝时，同时结束本应用启动的后端与生成请求。

## 构建

在 Apple Silicon Mac 上：

```sh
npm ci
bash scripts/build-macos.sh
```

完整源码开发时，`npm test` 的钥匙串测试需要先执行：

```sh
xcrun swiftc -target arm64-apple-macos14.0 -O -framework Security platform/macos/Keychain.swift -o platform/macos/zhizhi-keychain
codesign --force --sign - platform/macos/zhizhi-keychain
npm test
```

产物在 `release/`，包括安装包和 SHA256 校验文件。构建使用 Apple 官方 `pkgbuild` / `productbuild`，不会把 Windows 依赖、用户学习数据、个人模型密钥或客户端凭据打入包中。

可选环境变量：`MAC_APP_SIGN_IDENTITY`、`MAC_INSTALLER_SIGN_IDENTITY`、`MAC_NOTARY_PROFILE`。前两者为已经安装在构建机钥匙串中的证书身份；后者为通过官方 notarytool 保存的凭据配置。未提供时明确生成未公证的测试包。不要把证书或凭据提交到仓库。

## GitHub 更新发布

默认目标为 `mmasondu114/zhizhi`。仓库名若变更，需要同时更新 `server/updates.js`、`package.json`、`desktop/main.cjs` 和测试中的发布 URL。

`.github/workflows/macos-release.yml` 在 main 分支提交、版本标签或手动触发时：

1. 使用 `macos-15` ARM64 runner，实测架构，不把 Intel 构建冒称 ARM。
2. 编译并测试钥匙串助手；运行基础与浏览器回归。
3. 构建内置运行环境的 `.app` 和 `.pkg`。
4. 真实执行 Installer、启动内置运行时、复装并检查图数据和钥匙串保留。
5. 仅在验证通过后发布版本安装包和 SHA256；已发布同版本不会覆盖。

更新时修改 `package.json` 与 `package-lock.json` 的版本号后提交 main。GitHub 工作流自动创建对应版本 Release。更新检查只展示可信仓库的下载链接，不会悄悄执行下载代码或自动提升权限。

## 验证状态

Windows 上可完成 JS/前后端与浏览器回归，但无法替代 macOS 的 Swift 编译、钥匙串、Installer 和 Gatekeeper 验证。只有成功的 GitHub ARM Mac 工作流或实体 Mac 测试结果，才应标记 Mac 安装包已验证。
