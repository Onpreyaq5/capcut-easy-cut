$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$AppRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$WebDir = Join-Path $AppRoot 'web'

if (-not (Test-Path (Join-Path $WebDir 'package.json'))) {
  if (Test-Path (Join-Path $AppRoot 'package.json')) {
    $WebDir = $AppRoot
  }
}

if (-not (Test-Path (Join-Path $WebDir 'package.json'))) {
  Write-Host '[X] Cannot find web\package.json.'
  Write-Host 'Please extract the ZIP file completely before running this launcher.'
  exit 1
}

Set-Location $WebDir

Write-Host '============================================'
Write-Host '   CAPCUT Easy CUT'
Write-Host '   Drag clips - cut dead air - auto subtitles'
Write-Host '============================================'
Write-Host ''

$ensureDeps = Join-Path $WebDir 'tools\setup\ensure_deps.ps1'
if (-not (Test-Path $ensureDeps)) {
  Write-Host '[X] Missing tools\setup\ensure_deps.ps1.'
  Write-Host 'Please extract the ZIP file completely before running this launcher.'
  exit 1
}

Write-Host '[1/4] Checking required programs. Missing tools will be installed automatically...'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ensureDeps
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '[X] Some required programs are still missing. Read the message above, then run this file again.'
  exit $LASTEXITCODE
}

$depsEnv = Join-Path $env:LOCALAPPDATA 'CAPCUT_Easy_CUT\deps_env.cmd'
if (Test-Path $depsEnv) {
  $cmdOutput = & cmd.exe /d /s /c "call `"$depsEnv`" && set"
  foreach ($line in $cmdOutput) {
    $eq = $line.IndexOf('=')
    if ($eq -gt 0) {
      [Environment]::SetEnvironmentVariable($line.Substring(0, $eq), $line.Substring($eq + 1), 'Process')
    }
  }
}

Write-Host ''
Write-Host '[2/4] Checking Python libraries...'
& python -c "import faster_whisper, pythainlp, requests" *> $null
if ($LASTEXITCODE -ne 0) {
  Write-Host 'Installing Python libraries. This can take a while...'
  & python -m pip install -r (Join-Path $WebDir 'tools\capcut-auto\requirements.txt')
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

Write-Host ''
if (-not (Test-Path (Join-Path $WebDir 'node_modules'))) {
  Write-Host '[3/4] Installing web packages. This can take a while...'
  & npm install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  Write-Host '[3/4] Web packages already installed.'
}

if (-not $env:EASYCUT_WHISPER_MODEL) {
  $env:EASYCUT_WHISPER_MODEL = 'medium'
}

Write-Host ''
Write-Host '[4/4] Starting web app at http://localhost:3000'
Write-Host ''
Write-Host 'Keep this window open while using the app.'
Write-Host 'Closing this window stops the web app.'
Write-Host 'The first transcription may download a model once.'
Write-Host ''

Start-Job -ScriptBlock {
  Start-Sleep -Seconds 5
  Start-Process 'http://localhost:3000'
} | Out-Null

& npm run dev
exit $LASTEXITCODE
