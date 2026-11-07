$ErrorActionPreference = 'Stop'
Set-Location (Split-Path $PSScriptRoot -Parent)
$projectRoot = (Get-Location).Path
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid version' }
$buildRoot = Join-Path $projectRoot ('build\windows-' + [guid]::NewGuid().ToString('N'))
$stage = Join-Path $buildRoot 'payload'
New-Item -ItemType Directory -Force -Path $stage,(Join-Path $stage 'app'),(Join-Path $stage 'runtime'),(Join-Path $projectRoot 'release') | Out-Null
$nodeVersion = '24.16.0'
$zipName = "node-v$nodeVersion-win-x64.zip"
Invoke-WebRequest "https://nodejs.org/dist/v$nodeVersion/$zipName" -OutFile (Join-Path $buildRoot $zipName)
$sums = (Invoke-WebRequest "https://nodejs.org/dist/v$nodeVersion/SHASUMS256.txt").Content
$expected = (($sums -split "`n" | Where-Object { $_ -match "  $([regex]::Escape($zipName))\s*$" }) -split '\s+')[0]
if (!$expected -or (Get-FileHash (Join-Path $buildRoot $zipName) -Algorithm SHA256).Hash -ne $expected) { throw 'Node checksum mismatch' }
Expand-Archive -LiteralPath (Join-Path $buildRoot $zipName) -DestinationPath $buildRoot
Copy-Item -LiteralPath (Join-Path $buildRoot "node-v$nodeVersion-win-x64\node.exe") -Destination (Join-Path $stage 'runtime\node.exe')
Copy-Item -LiteralPath (Join-Path $buildRoot "node-v$nodeVersion-win-x64\LICENSE") -Destination (Join-Path $stage 'runtime\LICENSE')
& npm.cmd run build
if ($LASTEXITCODE) { throw 'Frontend build failed' }
foreach ($item in @('package.json','package-lock.json','server','shared','dist')) { Copy-Item -LiteralPath (Join-Path $projectRoot $item) -Destination (Join-Path $stage 'app') -Recurse }
Push-Location (Join-Path $stage 'app')
try { & npm.cmd ci --omit=dev --no-audit --no-fund; if ($LASTEXITCODE) { throw 'Production dependency install failed' } } finally { Pop-Location }
Add-Type -AssemblyName System.Drawing
$bitmap = [Drawing.Bitmap]::new(256,256)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$graphics.Clear([Drawing.Color]::FromArgb(110,83,181))
$font = [Drawing.Font]::new('Microsoft YaHei',140,[Drawing.FontStyle]::Bold,[Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('枝',$font,[Drawing.Brushes]::White,25,23)
$icon = [Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [IO.File]::Create((Join-Path $stage 'Zhizhi.ico'))
try { $icon.Save($stream) } finally { $stream.Dispose();$graphics.Dispose();$font.Dispose();$bitmap.Dispose() }
$metadata = Join-Path $buildRoot 'Version.cs'
[IO.File]::WriteAllText($metadata, "[assembly:System.Reflection.AssemblyVersion(`"$version.0`")]`n[assembly:System.Reflection.AssemblyFileVersion(`"$version.0`")]`n[assembly:System.Reflection.AssemblyInformationalVersion(`"$version`")]", [Text.UTF8Encoding]::new($false))
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $compiler /nologo /target:winexe /platform:x64 /optimize+ /codepage:65001 "/out:$stage\Zhizhi.exe" "/win32icon:$stage\Zhizhi.ico" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Web.Extensions.dll (Join-Path $projectRoot 'platform\windows\Launcher.cs') $metadata
if ($LASTEXITCODE) { throw 'Native launcher compile failed' }
$native = Start-Process -FilePath (Join-Path $stage 'Zhizhi.exe') -ArgumentList '--smoke-test' -Wait -PassThru -WindowStyle Hidden
if ($native.ExitCode) { throw 'Native launcher smoke test failed' }
$iscc = Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'
if (!(Test-Path -LiteralPath $iscc)) { throw 'Install Inno Setup 6 to build the installer' }
& $iscc "/DAppVersion=$version" "/DStagePath=$stage" "/DOutputPath=$projectRoot\release" (Join-Path $projectRoot 'platform\windows\installer.iss')
if ($LASTEXITCODE) { throw 'Installer build failed' }
$output = Join-Path $projectRoot "release\Zhizhi-$version-windows-x64-setup.exe"
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $projectRoot 'release\SHA256SUMS-windows.txt'), "$hash  $([IO.Path]::GetFileName($output))`n",[Text.UTF8Encoding]::new($false))
Write-Output "Built: $output"
