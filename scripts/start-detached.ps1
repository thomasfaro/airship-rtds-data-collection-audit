# Starts the app with no visible window and returns once it answers.
#
# This is what the rtds-audit: link runs, so a browser page — the app's own offline
# page, or "Open RTDS Audit.html" — can bring the tool back up on its own.
param(
  [switch]$Open,
  # Windows appends the clicked URL; it carries no information we need.
  [Parameter(ValueFromRemainingArguments = $true)]$Rest
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Port = if ($env:PORT) { $env:PORT } else { "3011" }
$AppUrl = "http://127.0.0.1:$Port"
$HealthUrl = "$AppUrl/api/health"
$TaskName = "Airship RTDS Data Collection Audit"

function Test-AppUp {
  try {
    return (Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200
  } catch {
    return $false
  }
}

if (Test-AppUp) {
  if ($Open) { Start-Process $AppUrl | Out-Null }
  exit 0
}

# When the background service is installed, let the scheduler start it rather than
# adding a second, unsupervised copy that would fight it for the port.
$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Start-ScheduledTask -TaskName $TaskName
} else {
  Start-Process -FilePath "powershell.exe" `
    -ArgumentList @("-NoProfile", "-WindowStyle", "Hidden", "-ExecutionPolicy", "Bypass",
      "-File", (Join-Path $PSScriptRoot "serve.ps1")) `
    -WindowStyle Hidden | Out-Null
}

# A normal start takes a couple of seconds; a first run has to install and build.
for ($i = 0; $i -lt 480; $i++) {
  if (Test-AppUp) {
    if ($Open) { Start-Process $AppUrl | Out-Null }
    exit 0
  }
  Start-Sleep -Milliseconds 250
}

Write-Error "The app did not come up on port $Port. Log: $(Join-Path $env:TEMP 'rtds-dca.log')"
exit 1
