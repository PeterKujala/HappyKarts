$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $projectRoot 'kartboard.pid'

if (-not (Test-Path -LiteralPath $pidFile)) {
  Write-Host 'KartBoard is not running.'
  exit 0
}

$serverPid = [int](Get-Content -LiteralPath $pidFile -Raw)
$process = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
if ($process -and $process.ProcessName -eq 'node') {
  Stop-Process -Id $serverPid
  $process.WaitForExit(3000)
}
Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
Write-Host 'KartBoard stopped.'
