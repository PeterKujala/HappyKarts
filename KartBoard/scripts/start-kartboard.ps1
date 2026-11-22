$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'kartboard.pid'
$serverFile = Join-Path $projectRoot 'server.js'
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if (-not $nodeCommand) {
  Write-Host 'Node.js 20 or newer is not on PATH.' -ForegroundColor Red
  Write-Host 'Install Node.js, then run this launcher again. You can also run: npm start'
  Read-Host 'Press Enter to close'
  exit 1
}
$node = $nodeCommand.Source

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
