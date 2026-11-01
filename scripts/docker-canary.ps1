param(
  [string]$Image = 'node:22-bookworm-slim'
)

$ErrorActionPreference = 'Stop'
$docker = 'C:\Program Files\Docker\Docker\resources\bin\docker.exe'
$workspace = 'D:\dsh_env\workspaces\codex_claude_dsh_comb_mod'
$common = @(
  'run', '--rm',
  '--network', 'none',
  '--read-only',
  '--cap-drop', 'ALL',
  '--security-opt', 'no-new-privileges',
  '--pids-limit', '256',
  '--memory', '512m',
  '--cpus', '1',
  '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
  '--user', '1000:1000',
  '--mount', "type=bind,source=$workspace,target=/workspace",
  '-w', '/workspace',
  $Image,
  'sh', '-lc'
)

function Invoke-Canary {
  param([string]$Name, [string]$Command, [scriptblock]$Check)
  $output = & $docker @common $Command 2>&1
  $code = $LASTEXITCODE
  $text = ($output | Out-String).Trim()
  try {
    $detail = & $Check $code $text
    Write-Output ("PASS  {0}  {1}" -f $Name, $detail)
  } catch {
    Write-Output ("FAIL  {0}  exit={1}  {2}" -f $Name, $code, $_.Exception.Message)
    Write-Output ("      output: {0}" -f $text)
    $script:failed += 1
  }
}

$script:failed = 0
Write-Output ("WEFT DOCKER CONFORMANCE image={0}" -f $Image)

Invoke-Canary 'workspace is reachable' 'pwd' {
  param($code, $text)
  if ($code -ne 0 -or $text -notmatch '^/workspace') { throw "expected /workspace, got $text" }
  $text
}

Invoke-Canary 'workspace write works' 'node -e "require(''fs'').writeFileSync(''.weft-docker-canary'',''ok'');process.stdout.write(''ok'')"' {
  param($code, $text)
  if ($code -ne 0 -or $text -notmatch 'ok') { throw "write failed: $text" }
  'ok'
}

Invoke-Canary 'non-root identity' 'id -u' {
  param($code, $text)
  if ($code -ne 0) { throw "id failed: $text" }
  if ($text.Trim() -eq '0') { throw 'running as root' }
  "uid=$($text.Trim())"
}

Invoke-Canary 'network egress denied' 'node -e "fetch(''https://example.com'').then(()=>process.exit(0)).catch(()=>process.exit(7))"' {
  param($code, $text)
  if ($code -eq 0) { throw 'network egress succeeded' }
  "exit=$code"
}

Invoke-Canary 'write outside workspace denied' 'node -e "require(''fs'').writeFileSync(''/etc/weft-canary'',''x'')"' {
  param($code, $text)
  if ($code -eq 0) { throw 'wrote /etc/weft-canary' }
  "exit=$code"
}

if ($script:failed -gt 0) {
  Write-Output ("RESULT: FAIL ({0})" -f $script:failed)
  exit 1
}
Write-Output 'RESULT: PASS'
