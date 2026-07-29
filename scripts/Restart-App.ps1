# Replaces the running server with a fresh one.
#
# Spawned detached by POST /api/updates/restart, which answers the browser and then
# exits. The waiting is the entire point: whoever starts the replacement has to be
# outside the process being replaced, and has to hold off until the port is free.

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Port = if ($env:PORT) { $env:PORT } else { "3011" }
$HealthUrl = "http://127.0.0.1:$Port/api/health"
$LogFile = Join-Path $env:TEMP "rtds-dca.log"

function Write-RestartLog {
  param([string]$Message)
  "[restart] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message" | Out-File -Append -FilePath $LogFile
}

function Test-AppUp {
  try {
    return (Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 1).StatusCode -eq 200
  } catch {
    return $false
  }
}

Write-RestartLog "waiting for the current server to stop"

# The old server exits within a fraction of a second. Ten seconds of patience covers a
# machine under load; past that, something else holds the port and starting a second
# copy would only fail on an address-in-use error.
for ($i = 0; $i -lt 40; $i++) {
  if (-not (Test-AppUp)) { break }
  Start-Sleep -Milliseconds 250
}

if (Test-AppUp) {
  Write-RestartLog "port $Port is still in use, leaving it alone"
  exit 1
}

Write-RestartLog "starting the new server"
& powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass `
  -File (Join-Path $PSScriptRoot "start-detached.ps1")
exit $LASTEXITCODE
