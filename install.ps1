param([switch]$SkipInstall)
$ErrorActionPreference = 'Stop'
$node = (node --version) 2>$null
if (-not $node) { throw 'Node.js not found. Install Node.js >= 24 first.' }
$major = [int](($node -replace '^v','') -split '\.')[0]
if ($major -lt 24) { throw "Node.js $node found; Weft requires >= 24." }
if (-not $SkipInstall) {
  npm install --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { throw 'npm install failed' }
}
if (-not (Test-Path .env)) {
  Copy-Item .env.example .env
  Write-Host 'Created .env from .env.example'
}
Write-Host 'Weft installed.'
Write-Host 'Next: node --experimental-strip-types src/cli.ts --demo'
