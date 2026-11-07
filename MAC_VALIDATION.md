# 桌面安装版验证记录 · 1.1.0

最终双平台流水线：[GitHub Actions 42415103704](https://github.com/mmasondu114/zhizhi/actions/runs/42415103704)。正式安装包与安装测试 JSON 均由该流程发布。

## 实际执行

- macOS 15 ARM64 runner：Swift 启动器与钥匙串助手编译；实际 PKG 安装；运行内置 ARM64 Node；原生启动器启动本地服务；覆盖安装后图文件保持一致、钥匙串密钥仍可读取；API 不返回密钥明文。
- Windows 2025 runner：原生 C# 启动器编译；EXE 静默安装；启动内置 x64 Node；覆盖安装保留知识图和可解密 DPAPI 密钥；卸载保留学习数据。
- 两个系统运行基础/协议测试，以及 17 项完整浏览器、7 项可读性、6 项交互和 6 项定向回归。Mac 测试实际使用原生 ARM Chromium；Windows 另在本地 Chrome 复测。已查看桌面、窄屏和 Mac 公式/配置截图。Safari 未单独测试。
- HTTP 提供方使用协议级模拟，覆盖 401、429、超时、取消、非法 JSON、空响应和断流。CI 没有用户的模型凭据，不能把它当作 Mac Codex/Claude 登录或付费 API 的真实接入测试。历史 Windows Codex 的真实生成记录见 TEST_REPORT.md。

## 找到并修复

1. 较旧保存请求失败可能把新学习状态覆盖回旧值：按最新待保存快照隔离结果，添加延迟失败回归。
2. macOS /var 与 /private/var 路径别名使后端入口判断失效：比较规范真实路径，并实际通过别名启动测试。
3. macOS 自带 Bash 3 无法在严格模式展开空签名参数数组：改为显式的有签名/无签名分支，缺少最终 PKG 时立即失败。
4. Windows 编译器参数使用本机绝对路径，避免源文件路径解释差异。

## 性能测量与限制

全图平移、无头 Chrome、CPU 4 倍降速：Windows 开发机 200 节点约 59.7Hz、1000 节点约 23.4Hz；Mac ARM CI 200 节点约 29.5Hz、1000 节点约 16.4Hz。这是 RAF 回调频率，不等于实际屏幕绘制帧率，也不能保证所有设备达到 60fps。大型图建议折叠或聚焦子树。

覆盖安装验证使用同版本包重复安装，确认应用文件替换不会覆盖外部数据；未来版本仍须维持数据格式迁移约定。未在用户的具体 Mac 上测试。

当前安装器没有 Authenticode/Developer ID 身份签名，Mac 未公证。原生助手的 ad-hoc 签名不等同于开发者身份认证，Gatekeeper/SmartScreen 可能提示或拦截安装。
