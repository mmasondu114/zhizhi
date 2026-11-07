$ErrorActionPreference = 'Stop'
$pidFile = Join-Path $PSScriptRoot 'data\server.pid'
if (Test-Path -LiteralPath $pidFile) {
    $serverPid = [int](Get-Content -LiteralPath $pidFile)
    $ownedProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $serverPid"
    $expectedScript = Join-Path $PSScriptRoot 'server\index.js'
    if ($ownedProcess -and $ownedProcess.Name -eq 'node.exe' -and $ownedProcess.CommandLine.Contains($expectedScript)) {
        Stop-Process -Id $serverPid
        Remove-Item -LiteralPath $pidFile
        Write-Output 'Knowledge Tree stopped.'
    }
}
