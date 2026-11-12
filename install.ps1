<#
.SYNOPSIS
  Builds Daiku from this folder and installs it on this PC.

.DESCRIPTION
  1. Checks for what the build needs: Node.js, Rust, the Microsoft C++ build tools and WebView2.
     Anything missing is installed with winget, but only after you say yes.
  2. Installs the npm packages, fetches the maths model (checked by hash) and builds the app.
  3. Runs the Daiku installer it just built. It installs for your user only, so no admin rights.

  Run it from Explorer with "Install Daiku.cmd", or from PowerShell:
    powershell -ExecutionPolicy Bypass -File .\install.ps1

.PARAMETER BuildOnly
  Build the installer but don't run it. It is left in src-tauri\target\release\bundle\nsis\.

.PARAMETER Yes
  Install missing tools without asking each time.

.PARAMETER SkipChecks
  Don't look for prerequisites. For machines you've already set up.
#>
[CmdletBinding()]
param(
  [switch]$BuildOnly,
  [switch]$Yes,
  [switch]$SkipChecks
)

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
Write-Host "  Builds the app from this folder, then installs it for your user." -ForegroundColor Gray

if (-not (Test-Path (Join-Path $Root 'package.json'))) {
  Fail "Run this from the Daiku folder (the one with package.json)."
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
if ($BuildOnly) {
  Info "Skipped, as asked. The installer is here:"
  Info $setup.FullName
} else {
  Info 'The Daiku setup window will open. The build is unsigned, so Windows SmartScreen may ask you to confirm.'
  $proc = Start-Process -FilePath $setup.FullName -PassThru -Wait
  if ($proc.ExitCode -ne 0) { Fail "Setup ended with code $($proc.ExitCode). You can run it again from $($setup.FullName)." }
  Ok 'Daiku is installed. Find it in the Start menu.'
}
Write-Host ""
