# 桌面安装版验证记录

版本：1.1.0。测试在独立 GitHub Actions runner 与 Windows 开发环境执行。

已确认的结果：

- Windows 安装器实际构建成功；静默安装、原生启动器启动内置 Node、覆盖安装保留图和可解密 DPAPI 密钥、卸载保留学习数据通过。第一次完整安装验证见 Actions run 42414354198 的 windows job。
- Mac ARM 原生钥匙串编译、真实写入/读取/删除、全套基础和浏览器回归通过。
- 初次 Mac 打包启动未通过，发现临时目录 /var 与 /private/var 的路径别名问题，已改为规范真实路径判断启动入口，并加入文件系统别名启动测试。最终安装验证以成功 Release 的附件为准。
- 修复旧保存请求失败后覆盖新学习状态的问题；新增延迟失败与更新下载入口测试，本机 6 项定向浏览器回归通过。
- 本机 17 项完整浏览器回归通过，控制台异常 0；已查看桌面和窄屏截图。
- 本机 Chrome 无头、CPU 4 倍降速、全图平移：200 节点 RAF 约 59.7Hz，1000 节点约 23.4Hz。这是动画回调频率，不保证实际屏幕呈现帧率。

所有模型 HTTP 错误测试使用模拟服务。历史 Windows Codex 真正生成已验证；本次 CI 不含用户模型登录凭据，不能代表 Mac Codex / Claude 账号登录或付费 API 接入已验证。

安装包没有 Developer ID/Authenticode 签名，Mac 未公证；不声称 Gatekeeper/SmartScreen 无提示。Apple 原生助手的 ad-hoc 签名只用于本地运行，不等同于开发者身份认证。

GitHub 工作流只有两边测试均成功才发布，安装测试原始 JSON 会作为 Release 附件。
