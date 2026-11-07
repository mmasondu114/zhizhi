$ErrorActionPreference = 'Stop'
$projectDir = $PSScriptRoot
Set-Location -LiteralPath $projectDir
$port = if ($env:PORT) { [int]$env:PORT } else { 4317 }
$url = "http://127.0.0.1:$port"
try {
    $running = Invoke-RestMethod "$url/api/bootstrap" -TimeoutSec 2
    if ($running.version -eq 1 -and $running.token) { Start-Process $url; exit 0 }
} catch {}
$nodeCommand = Get-Command node.exe -ErrorAction SilentlyContinue
if (-not $nodeCommand) { throw 'Node.js 22 or later is required. Install from https://nodejs.org then run Start.cmd again.' }
$npmCommand = Get-Command npm.cmd -ErrorAction Stop
if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'node_modules\vite'))) {
    & $npmCommand.Source ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed. Check network/proxy and retry.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectDir 'dist\index.html'))) {
    & $npmCommand.Source run build
    if ($LASTEXITCODE -ne 0) { throw 'Build failed. See output above.' }
}
$dataDir = Join-Path $projectDir 'data'
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
$serverFile = Join-Path $projectDir 'server\index.js'
$serverProcess = Start-Process -FilePath $nodeCommand.Source -ArgumentList @('"' + $serverFile + '"') -WorkingDirectory $projectDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $dataDir 'server.log') -RedirectStandardError (Join-Path $dataDir 'server-error.log')
$serverProcess.Id | Set-Content -LiteralPath (Join-Path $dataDir 'server.pid')
for ($attempt=0; $attempt -lt 40; $attempt++) {
    Start-Sleep -Milliseconds 500
    try {
        $ready = Invoke-RestMethod "$url/api/bootstrap" -TimeoutSec 1
        if ($ready.version -eq 1) { Start-Process $url; Write-Output "Ready: $url"; exit 0 }
    } catch {}
}
throw 'Startup failed. Check data\server-error.log. Existing knowledge graphs have not been removed.'
