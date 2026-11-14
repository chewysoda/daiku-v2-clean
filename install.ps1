<#
.SYNOPSIS
  Builds Daiku from this folder and installs it on this PC.

.DESCRIPTION
  1. Checks for what the build needs: Node.js, Rust, the Microsoft C++ build tools and WebView2.
     Anything missing is installed with winget, but only after you say yes.
  2. Installs the npm packages and builds the app. The maths model downloads inside the app, the first time it is used.
  3. Runs the Daiku installer it just built. It installs for your user only, so no admin rights.

  Run it from Explorer with "Install Daiku.cmd", or from PowerShell:
    powershell -ExecutionPolicy Bypass -File .\install.ps1

  If a ready-made Daiku setup file (Daiku*-setup.exe or Daiku-Setup*.exe) is next to this script, none of that
  happens: it just runs that file, which takes under a minute and needs no tools at all.

.PARAMETER BuildOnly
  Build the installer but don't run it. It is left in src-tauri\target\release\bundle\nsis\.

.PARAMETER Share
  Build the installer and copy it to share\Daiku-Setup-<version>.exe, ready to send to someone. Doesn't install it here.

.PARAMETER Rebuild
  Build from source even if a ready-made setup file is next to this script.

.PARAMETER Yes
  Install missing tools without asking each time.

.PARAMETER SkipChecks
  Don't look for prerequisites. For machines you've already set up.
#>
[CmdletBinding()]
param(
  [switch]$BuildOnly,
  [switch]$Share,
  [switch]$Rebuild,
  [switch]$Yes,
  [switch]$SkipChecks
)
if ($Share) { $BuildOnly = $true }

$ErrorActionPreference = 'Stop'
$Root = $PSScriptRoot
Set-Location $Root

function Step($n, $text) { Write-Host ""; Write-Host "[$n/4] $text" -ForegroundColor Cyan }
function Ok($text) { Write-Host "  ok   $text" -ForegroundColor Green }
function Info($text) { Write-Host "       $text" }
function Warn($text) { Write-Host "  !    $text" -ForegroundColor Yellow }
function Fail($text) {
  Write-Host ""
  Write-Host "  Stopped: $text" -ForegroundColor Red
  Write-Host ""
  exit 1
}

function Ask($question) {
  if ($Yes) { return $true }
  $answer = Read-Host "       $question [Y/n]"
  return ($answer -eq '' -or $answer -match '^(y|yes)$')
}

# winget installs refresh PATH only for new shells, so read it again from the registry.
function Update-PathFromRegistry {
  $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
  $user = [Environment]::GetEnvironmentVariable('Path', 'User')
  $env:Path = "$machine;$user;$env:USERPROFILE\.cargo\bin"
}

function Have($command) { [bool](Get-Command $command -ErrorAction SilentlyContinue) }

function Install-WithWinget($id, $name, [string[]]$extra = @()) {
  if (-not (Have 'winget')) {
    Fail "$name is missing and winget isn't available to install it. Install $name yourself, then run this again."
  }
  if (-not (Ask "Install $name with winget?")) { Fail "$name is needed to build Daiku." }
  Info "Installing $name. This can take a few minutes..."
  $wingetArgs = @('install', '--id', $id, '-e', '--source', 'winget', '--accept-package-agreements', '--accept-source-agreements') + $extra
  & winget @wingetArgs
  if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
    # -1978335189 is winget's "already installed".
    Fail "winget couldn't install $name (exit code $LASTEXITCODE)."
  }
  Update-PathFromRegistry
}

function Test-BuildTools {
  $vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
  if (-not (Test-Path $vswhere)) { return $false }
  $found = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
  return [bool]$found
}

function Test-WebView2 {
  $keys = @(
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKLM:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}',
    'HKCU:\SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
  )
  foreach ($k in $keys) {
    $v = (Get-ItemProperty -Path $k -Name pv -ErrorAction SilentlyContinue).pv
    if ($v -and $v -ne '0.0.0.0') { return $true }
  }
  return $false
}

Write-Host ""
Write-Host "  Daiku installer" -ForegroundColor White

# ---- Fast path: a ready-made setup file next to this script --------------------------
# Building from source downloads Node, Rust and several GB of C++ build tools, then compiles for
# 10 to 20 minutes. Someone who was sent the setup file needs none of that.
if (-not $Rebuild -and -not $BuildOnly) {
  $ready = @(Get-ChildItem -Path $Root -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^Daiku.*setup.*\.exe$' }) +
    @(Get-ChildItem -Path (Join-Path $Root 'share') -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^Daiku.*setup.*\.exe$' }) |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($ready) {
    Write-Host "  Found a ready-made installer, so there's nothing to download or build." -ForegroundColor Gray
    Write-Host ""
    Info "Running $($ready.Name). It's unsigned, so if Windows SmartScreen asks, choose 'More info', then 'Run anyway'."
    $proc = Start-Process -FilePath $ready.FullName -PassThru -Wait
    if ($proc.ExitCode -ne 0) { Fail "Setup ended with code $($proc.ExitCode). You can run $($ready.FullName) again yourself." }
    Ok 'Daiku is installed. Find it in the Start menu.'
    Write-Host ""
    exit 0
  }
}

Write-Host "  Builds the app from this folder, then installs it for your user." -ForegroundColor Gray

if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  Fail "Run this from the Daiku folder (the one with package.json)."
}
if (-not $BuildOnly) {
  Write-Host ""
  Warn 'No ready-made installer was found, so Daiku will be built from source.'
  Info 'On a new PC that means downloading Node.js, Rust and the C++ build tools (several GB), then'
  Info 'a 10 to 20 minute compile. If someone has Daiku already, ask them for Daiku-Setup.exe instead:'
  Info 'it installs in under a minute. They make it with "npm run share".'
  if (-not (Ask 'Build from source anyway?')) { exit 0 }
}

# ---- 1. Prerequisites ----------------------------------------------------------------
Step 1 'Checking what the build needs'
Update-PathFromRegistry
if ($SkipChecks) {
  Info 'Skipped, as asked.'
} else {
  if (Have 'node') {
    $major = [int]((node -v).TrimStart('v').Split('.')[0])
    if ($major -lt 20) {
      Warn "Node.js $(node -v) is older than the version 20 the build needs."
      Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    }
    Ok "Node.js $(node -v)"
  } else {
    Warn 'Node.js is not installed.'
    Install-WithWinget 'OpenJS.NodeJS.LTS' 'Node.js LTS'
    if (-not (Have 'node')) { Fail 'Node.js installed, but this window cannot see it yet. Close it and run the installer again.' }
    Ok "Node.js $(node -v)"
  }

  if (-not (Test-BuildTools)) {
    Warn 'The Microsoft C++ build tools are missing. Rust needs them on Windows.'
    Install-WithWinget 'Microsoft.VisualStudio.2022.BuildTools' 'Visual Studio C++ Build Tools' @('--override', '--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended')
    if (-not (Test-BuildTools)) { Fail 'The C++ build tools still are not found. Restart Windows, then run this again.' }
  }
  Ok 'Microsoft C++ build tools'

  if (-not (Have 'cargo')) {
    Warn 'Rust is not installed.'
    Install-WithWinget 'Rustlang.Rustup' 'Rust (rustup)'
    if (Have 'rustup') { rustup default stable | Out-Null }
    if (-not (Have 'cargo')) { Fail 'Rust installed, but this window cannot see it yet. Close it and run the installer again.' }
  }
  Ok ((cargo --version) -replace '\s+\(.*$', '')

  if (-not (Test-WebView2)) {
    Warn 'Microsoft Edge WebView2 is missing. Daiku draws its window with it.'
    Install-WithWinget 'Microsoft.EdgeWebView2Runtime' 'WebView2 Runtime'
  }
  Ok 'WebView2 Runtime'
}

# ---- 2. Packages ---------------------------------------------------------------------
Step 2 'Installing packages'
if (Test-Path (Join-Path $Root 'package-lock.json')) { npm ci --no-audit --no-fund } else { npm install --no-audit --no-fund }
if ($LASTEXITCODE -ne 0) { Fail 'npm could not install the packages. Check your internet connection and try again.' }
Ok 'npm packages'

# ---- 3. Build ------------------------------------------------------------------------
Step 3 'Building Daiku (the first build compiles Rust and can take 10 to 20 minutes)'
$started = Get-Date
npm run tauri build
if ($LASTEXITCODE -ne 0) { Fail 'The build failed. The messages above say why.' }
$bundle = Join-Path $Root 'src-tauri\target\release\bundle\nsis'
$setup = Get-ChildItem -Path $bundle -Filter '*-setup.exe' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { Fail "The build finished, but no installer was found in $bundle." }
Ok ("Built in {0:N0} minutes: {1}" -f ((Get-Date) - $started).TotalMinutes, $setup.Name)

# ---- 4. Install ----------------------------------------------------------------------
Step 4 'Installing Daiku'
if ($Share) {
  $outDir = Join-Path $Root 'share'
  New-Item -ItemType Directory -Force -Path $outDir | Out-Null
  $version = (Get-Content (Join-Path $Root 'src-tauri\tauri.conf.json') -Raw | ConvertFrom-Json).version
  $out = Join-Path $outDir "Daiku-Setup-$version.exe"
  Copy-Item $setup.FullName $out -Force
  Ok ("Ready to send: {0} ({1:N0} MB)" -f $out, ((Get-Item $out).Length / 1MB))
  Info 'Send that one file. They double-click it and Daiku installs in under a minute, for their user only.'
  Info "It isn't code-signed, so Windows asks them to confirm: 'More info', then 'Run anyway'."
  Start-Process explorer.exe "/select,`"$out`""
} elseif ($BuildOnly) {
  Info "Skipped, as asked. The installer is here:"
  Info $setup.FullName
} else {
  Info 'The Daiku setup window will open. The build is unsigned, so Windows SmartScreen may ask you to confirm.'
  $proc = Start-Process -FilePath $setup.FullName -PassThru -Wait
  if ($proc.ExitCode -ne 0) { Fail "Setup ended with code $($proc.ExitCode). You can run it again from $($setup.FullName)." }
  Ok 'Daiku is installed. Find it in the Start menu.'
}
Write-Host ""
