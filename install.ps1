param(
  [string]$Version = 'main',
  [string]$Dest = '',
  [string]$Bin = '',
  [switch]$DryRun,
  [switch]$Help
)
$ErrorActionPreference = 'Stop'
if ($Help) {
  Write-Host 'Weft installer'
  Write-Host '  -Version <ref>   branch/tag (default: main)'
  Write-Host '  -Dest <path>     install directory (default: %LOCALAPPDATA%\Weft)'
  Write-Host '  -Bin <path>      command directory (default: %USERPROFILE%\.weft\bin)'
  Write-Host '  -DryRun          print plan without changes'
  exit 0
}
if (-not $Dest) { $Dest = Join-Path $env:LOCALAPPDATA 'Weft' }
if (-not $Bin) { $Bin = Join-Path $env:USERPROFILE '.weft\bin' }
$Repo = 'https://github.com/czheng5/weft-agnet.git'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw 'Node.js not found. Install Node.js >= 24 first.' }
$nodeVersion = (& node --version).Trim()
$major = [int](($nodeVersion -replace '^v','') -split '\.')[0]
if ($major -lt 24) { throw "Node.js $nodeVersion found; Weft requires >= 24." }

$local = (Test-Path .\package.json) -and (Test-Path .\src\cli.ts) -and (Test-Path .\install.ps1)
$root = if ($local) { (Get-Location).Path } else { Join-Path $Dest 'app' }
$weftCmd = Join-Path $Bin 'weft.cmd'

Write-Host 'Weft installer'
Write-Host ("  version: " + $Version)
Write-Host ("  root:    " + $root)
Write-Host ("  bin:     " + $Bin)
if ($DryRun) { Write-Host 'dry-run: no changes'; exit 0 }

if (-not $local) {
  if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw 'git is required to bootstrap Weft.'
  }
  New-Item -ItemType Directory -Force -Path $Dest | Out-Null
  if (Test-Path (Join-Path $root '.git')) {
    Write-Host 'Updating existing checkout...'
    git -C $root fetch --depth 1 origin $Version
    if ($LASTEXITCODE -ne 0) { throw 'git fetch failed' }
    git -C $root checkout -q FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw 'git checkout failed' }
  } else {
    Write-Host "Cloning $Repo ($Version)..."
    git clone --depth 1 --branch $Version $Repo $root
    if ($LASTEXITCODE -ne 0) { throw 'git clone failed' }
  }
}

Push-Location $root
try {
  Write-Host 'Installing Node dependencies...'
  & npm.cmd install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }

  if ((Test-Path .env.example) -and -not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host 'Created .env from .env.example'
  }

  New-Item -ItemType Directory -Force -Path $Bin | Out-Null
  $wrapper = '@echo off' + [Environment]::NewLine + 'node --experimental-strip-types "' + (Join-Path $root 'src\cli.ts') + '" %*' + [Environment]::NewLine
  Set-Content -Path $weftCmd -Value $wrapper -Encoding ASCII

  $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
  $parts = @()
  if ($userPath) { $parts = $userPath -split ';' }
  if ($parts -notcontains $Bin) {
    $newPath = if ($userPath) { $userPath + ';' + $Bin } else { $Bin }
    [Environment]::SetEnvironmentVariable('Path', $newPath, 'User')
    Write-Host 'Added Weft to user PATH; restart the terminal to use it.'
  }
} finally {
  Pop-Location
}

Write-Host ''
Write-Host "Weft installed: $weftCmd"
Write-Host 'Run: weft --demo'
