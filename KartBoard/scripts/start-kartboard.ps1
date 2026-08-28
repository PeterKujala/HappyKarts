$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'kartboard.pid'
$serverFile = Join-Path $projectRoot 'server.js'
$bundledNode = 'C:\Users\peter\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { (Get-Command node -ErrorAction Stop).Source }

if (Test-Path -LiteralPath $pidFile) {
  $existingPid = [int](Get-Content -LiteralPath $pidFile -Raw)
  $existing = Get-Process -Id $existingPid -ErrorAction SilentlyContinue
  if ($existing -and $existing.ProcessName -eq 'node') {
    Stop-Process -Id $existingPid
    $existing.WaitForExit(3000)
  }
  Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
}

Start-Process -FilePath $node -ArgumentList @("`"$serverFile`"") -WorkingDirectory $projectRoot -WindowStyle Hidden | Out-Null

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
  Start-Sleep -Milliseconds 150
  try {
    $meta = Invoke-RestMethod -Uri 'http://127.0.0.1:4317/api/meta' -TimeoutSec 1
    if ($meta.apiVersion -eq 2) { $ready = $true; break }
  } catch {}
}

if (-not $ready) {
  Write-Host 'KartBoard could not start. Port 4317 may already be occupied.' -ForegroundColor Red
  Write-Host 'Run Stop KartBoard.cmd, then try again.'
  Read-Host 'Press Enter to close'
  exit 1
}

Start-Process 'http://127.0.0.1:4317/control.html'
