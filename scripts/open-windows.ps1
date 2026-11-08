# Launch through the Windows desktop shell so a temporary command session does not own the app.
param([string]$AppPath=(Join-Path $env:LOCALAPPDATA 'Programs\Zhizhi\Zhizhi.exe'))
$ErrorActionPreference='Stop'
$resolved=(Resolve-Path -LiteralPath $AppPath).Path
$shell=New-Object -ComObject Shell.Application
$shell.ShellExecute($resolved,'',(Split-Path -Parent $resolved),'open',1)
