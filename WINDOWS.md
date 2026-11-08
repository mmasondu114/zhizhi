# Windows 安装版

支持 Windows 10/11 x64。发布文件为 Zhizhi-版本-windows-x64-setup.exe，内置 Node.js 24.16.0 及生产依赖。使用每用户安装，无需管理员权限。程序位于 %LOCALAPPDATA%\Programs\Zhizhi；图与加密设置位于 %LOCALAPPDATA%\Zhizhi\data。

安装后从开始菜单或可选桌面快捷方式启动；启动后直接进入独立应用窗口；关闭窗口会退出本应用启动的服务及子进程。卸载保留学习数据，方便重新安装；需要删除学习数据时由用户自行备份后处理数据目录。

源码构建要求 Node.js、npm、Inno Setup 6 和 Windows 自带的 .NET Framework 4.x 编译器：

```powershell
npm ci
npm test
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\build-windows.ps1
```

产物在 release 目录，附 SHA256。构建下载官方 Node 并核对官方 SHA256，不把开发机用户数据或凭据打入安装包。GitHub Actions 在 Windows 2025 runner 执行真实静默安装、原生启动、覆盖安装保留知识图/DPAPI 密钥、卸载保留知识图测试。

发布包当前未做 Authenticode 签名，因此 SmartScreen 可能提醒未知发布者。没有承诺已签名或免提示安装。
