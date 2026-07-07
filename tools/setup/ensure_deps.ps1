# ensure_deps.ps1 — ตรวจ + ติดตั้งโปรแกรมที่ CAPCUT Easy CUT ต้องใช้ให้อัตโนมัติ
# (Node.js, Python, ffmpeg) — เรียกจากไฟล์ .bat ของแอป ผู้ใช้ไม่ต้องติดตั้งเองทีละตัว
#
# ผลลัพธ์: เขียนไฟล์ %LOCALAPPDATA%\CAPCUT_Easy_CUT\deps_env.cmd
#   ให้ .bat ที่เรียก call ต่อ เพื่อให้ PATH/ตัวแปร EASYCUT_FFMPEG ใช้ได้ทันที
#   (โปรแกรมที่เพิ่งติดตั้งใหม่จะยังไม่อยู่ใน PATH ของหน้าต่างเดิม)
# Exit code: 0 = พร้อมใช้งานครบ, 1 = ยังขาดบางตัว (พิมพ์วิธีแก้ไว้บนจอแล้ว)
#
# เขียนให้รองรับ Windows PowerShell 5.1 (ตัวที่มากับ Windows ทุกเครื่อง)
param(
  [switch]$SkipNode,             # ข้ามการเช็ค Node.js (สำหรับ .bat ฝั่งเอนจินที่ไม่ใช้เว็บ)
  [switch]$ForceDownloadFfmpeg   # บังคับใช้เส้นทางดาวน์โหลดตรง (ใช้ทดสอบ/ซ่อมเครื่องที่ winget พัง)
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
try {
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
} catch {}

$AppDir = Join-Path $env:LOCALAPPDATA 'CAPCUT_Easy_CUT'
$EnvCmd = Join-Path $AppDir 'deps_env.cmd'
New-Item -ItemType Directory -Force -Path $AppDir | Out-Null

$addPath  = New-Object 'System.Collections.Generic.List[string]'
$envLines = New-Object 'System.Collections.Generic.List[string]'
$missing  = New-Object 'System.Collections.Generic.List[string]'

function Test-Exe {
  param([string]$Exe, [string]$TestArg = '--version')
  try {
    $null = & $Exe $TestArg 2>&1
    return ($LASTEXITCODE -eq 0)
  } catch {
    return $false
  }
}

function Get-Winget {
  return (Get-Command winget -ErrorAction SilentlyContinue)
}

function Invoke-WingetInstall {
  param([string]$Id, [string]$Label)
  $w = Get-Winget
  if (-not $w) { return $false }
  Write-Host "   กำลังติดตั้ง $Label ผ่าน winget (ครั้งเดียว อาจใช้เวลา 1-5 นาที)..."
  & winget install --id $Id -e --accept-source-agreements --accept-package-agreements 2>&1 | Out-Host
  return $true
}

# ---------- ffmpeg ----------
function Find-FfmpegIn {
  param([string]$Root)
  if (-not (Test-Path $Root)) { return $null }
  $hits = Get-ChildItem -Path $Root -Recurse -Filter 'ffmpeg.exe' -ErrorAction SilentlyContinue
  foreach ($h in $hits) {
    $probe = Join-Path $h.DirectoryName 'ffprobe.exe'
    if ((Test-Path $probe) -and (Test-Exe $h.FullName '-version')) { return $h.FullName }
  }
  return $null
}

function Find-Ffmpeg {
  # 1) อยู่ใน PATH อยู่แล้ว
  $c = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
  if ($c) {
    $probe = Join-Path (Split-Path $c.Source) 'ffprobe.exe'
    if ((Test-Path $probe) -and (Test-Exe $c.Source '-version')) { return $c.Source }
  }
  # 2) ตัวลิงก์ของ winget (ติดตั้งแล้วแต่ PATH หน้าต่างนี้ยังไม่รีเฟรช)
  $link = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Links\ffmpeg.exe'
  if (Test-Path $link) {
    $probeLink = Join-Path (Split-Path $link) 'ffprobe.exe'
    if ((Test-Path $probeLink) -and (Test-Exe $link '-version')) { return $link }
  }
  # 3) โฟลเดอร์แพ็กเกจของ winget (Gyan.FFmpeg)
  $pkgs = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path $pkgs) {
    $gyan = Get-ChildItem -Path $pkgs -Directory -Filter 'Gyan.FFmpeg*' -ErrorAction SilentlyContinue
    foreach ($g in $gyan) {
      $f = Find-FfmpegIn $g.FullName
      if ($f) { return $f }
    }
  }
  # 4) ตัวที่สคริปต์นี้เคยดาวน์โหลดไว้เอง
  $f = Find-FfmpegIn (Join-Path $AppDir 'ffmpeg')
  if ($f) { return $f }
  # 5) ตำแหน่งติดตั้งเองยอดนิยม
  foreach ($root in @('C:\ffmpeg', (Join-Path $env:ProgramFiles 'ffmpeg'))) {
    $f = Find-FfmpegIn $root
    if ($f) { return $f }
  }
  return $null
}

function Install-FfmpegDownload {
  # ดาวน์โหลดตรงจาก gyan.dev (build ทางการที่ winget ก็ใช้) — สำหรับเครื่องที่ไม่มี winget
  $url  = 'https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip'
  $zip  = Join-Path $env:TEMP 'capcut_easycut_ffmpeg.zip'
  $dest = Join-Path $AppDir 'ffmpeg'
  Write-Host '   กำลังดาวน์โหลด ffmpeg (~90MB) — รอสักครู่...'
  $ok = $false
  $curl = Join-Path $env:SystemRoot 'System32\curl.exe'
  if (Test-Path $curl) {
    & $curl -L --fail --retry 3 --connect-timeout 20 -o $zip $url
    $ok = (($LASTEXITCODE -eq 0) -and (Test-Path $zip))
  }
  if (-not $ok) {
    try {
      Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
      $ok = (Test-Path $zip)
    } catch { $ok = $false }
  }
  if (-not $ok) { return $false }
  if (Test-Path $dest) { Remove-Item -Recurse -Force $dest -ErrorAction SilentlyContinue }
  New-Item -ItemType Directory -Force -Path $dest | Out-Null
  try {
    Expand-Archive -Path $zip -DestinationPath $dest -Force
  } catch {
    Write-Host "   [!] แตกไฟล์ ffmpeg ไม่สำเร็จ: $($_.Exception.Message)"
    return $false
  }
  Remove-Item $zip -Force -ErrorAction SilentlyContinue
  return $true
}

# ============ 1) Node.js (ใช้รันหน้าเว็บ) ============
if (-not $SkipNode) {
  $npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
  if (-not $npm) { $npm = Get-Command npm -ErrorAction SilentlyContinue }
  if (-not $npm) {
    $nodeDir = Join-Path $env:ProgramFiles 'nodejs'
    if (-not (Test-Path (Join-Path $nodeDir 'npm.cmd'))) {
      Write-Host '[ติดตั้งอัตโนมัติ] ไม่พบ Node.js — กำลังติดตั้งให้ (ถ้ามีหน้าต่างถามสิทธิ์ ให้กด Yes)...'
      $null = Invoke-WingetInstall -Id 'OpenJS.NodeJS.LTS' -Label 'Node.js LTS'
    }
    if (Test-Path (Join-Path $nodeDir 'npm.cmd')) {
      $addPath.Add($nodeDir)
      Write-Host "   Node.js: $nodeDir"
    } else {
      $missing.Add('node')
      Write-Host '[X] ติดตั้ง Node.js อัตโนมัติไม่สำเร็จ'
      Write-Host '    วิธีแก้: โหลดตัวติดตั้งจาก https://nodejs.org (เลือก LTS) ติดตั้งเสร็จแล้วเปิดไฟล์นี้ใหม่'
    }
  }
}

# ============ 2) Python (ใช้ตัดคลิป/ถอดเสียง) ============
$pyOk = Test-Exe 'python' '--version'
if (-not $pyOk) {
  # เผื่อมี Python จริงในเครื่องแต่คำสั่ง python โดน alias ของ Microsoft Store บัง
  $pyExe = $null
  try { $pyExe = (& py -3 -c 'import sys;print(sys.executable)' 2>$null | Select-Object -First 1) } catch {}
  if ($pyExe) { $pyExe = ([string]$pyExe).Trim() }
  if ($pyExe -and (Test-Path $pyExe)) {
    $pyDir = Split-Path $pyExe
    $addPath.Add($pyDir)
    $addPath.Add((Join-Path $pyDir 'Scripts'))
    Write-Host "   Python: $pyExe"
  } else {
    Write-Host '[ติดตั้งอัตโนมัติ] ไม่พบ Python — กำลังติดตั้งให้...'
    $null = Invoke-WingetInstall -Id 'Python.Python.3.12' -Label 'Python 3.12'
    $pyRoot = Join-Path $env:LOCALAPPDATA 'Programs\Python'
    $found = $null
    if (Test-Path $pyRoot) {
      $found = Get-ChildItem -Path $pyRoot -Directory -Filter 'Python3*' -ErrorAction SilentlyContinue |
        Sort-Object Name -Descending | Select-Object -First 1
    }
    if ($found -and (Test-Path (Join-Path $found.FullName 'python.exe'))) {
      $addPath.Add($found.FullName)
      $addPath.Add((Join-Path $found.FullName 'Scripts'))
      Write-Host "   Python: $($found.FullName)"
    } else {
      $missing.Add('python')
      Write-Host '[X] ติดตั้ง Python อัตโนมัติไม่สำเร็จ'
      Write-Host '    วิธีแก้: โหลดจาก https://python.org (ตอนติดตั้งติ๊ก "Add python.exe to PATH") แล้วเปิดไฟล์นี้ใหม่'
    }
  }
}

# ============ 3) ffmpeg (ใช้ตัด Dead air / แปลงวิดีโอ) ============
$ff = $null
if (-not $ForceDownloadFfmpeg) { $ff = Find-Ffmpeg }
if (-not $ff) {
  Write-Host '[ติดตั้งอัตโนมัติ] ไม่พบ ffmpeg — กำลังติดตั้งให้...'
  if (-not $ForceDownloadFfmpeg) {
    if (Invoke-WingetInstall -Id 'Gyan.FFmpeg' -Label 'ffmpeg') { $ff = Find-Ffmpeg }
  }
  if (-not $ff) {
    if (Install-FfmpegDownload) { $ff = Find-FfmpegIn (Join-Path $AppDir 'ffmpeg') }
  }
  if (-not $ff) {
    $missing.Add('ffmpeg')
    Write-Host '[X] ติดตั้ง ffmpeg อัตโนมัติไม่สำเร็จ (อาจเป็นที่อินเทอร์เน็ต)'
    Write-Host '    วิธีแก้: เช็คอินเทอร์เน็ตแล้วเปิดไฟล์นี้ใหม่ หรือติดตั้งเองด้วยคำสั่ง  winget install Gyan.FFmpeg'
  }
}
if ($ff) {
  $ffprobe = Join-Path (Split-Path $ff) 'ffprobe.exe'
  $envLines.Add(('set "EASYCUT_FFMPEG=' + $ff + '"'))
  $envLines.Add(('set "EASYCUT_FFPROBE=' + $ffprobe + '"'))
  Write-Host "   ffmpeg: $ff"
}

# ============ เขียนไฟล์ env ให้ .bat ที่เรียกใช้ต่อ ============
if ($addPath.Count -gt 0) {
  $envLines.Insert(0, ('set "PATH=' + (($addPath | Select-Object -Unique) -join ';') + ';%PATH%"'))
}
$body = '@echo off' + "`r`n" + (($envLines) -join "`r`n") + "`r`n"
# UTF-8 ไม่มี BOM — cmd ที่ chcp 65001 อ่านได้ และ BOM จะทำให้ cmd อ่านบรรทัดแรกพัง
[IO.File]::WriteAllText($EnvCmd, $body, (New-Object System.Text.UTF8Encoding($false)))

if ($missing.Count -gt 0) { exit 1 }
Write-Host '   โปรแกรมที่จำเป็นครบแล้ว'
exit 0
