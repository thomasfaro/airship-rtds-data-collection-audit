# One-click launcher (Windows): install what is missing, build the interface,
# serve app + API on a single port, open the browser.
# Called by "Start RTDS Data Collection Audit.bat".
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Port = if ($env:PORT) { $env:PORT } else { "3011" }
$AppUrl = "http://127.0.0.1:$Port"
$HealthUrl = "$AppUrl/api/health"
$LogFile = Join-Path $env:TEMP "rtds-dca.log"
$ServerJob = $null

function Test-AppUp {
  try {
    $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Stop-ServerJob {
  if ($ServerJob) {
    Stop-Job $ServerJob -ErrorAction SilentlyContinue
    Remove-Job $ServerJob -Force -ErrorAction SilentlyContinue
  }
}

Register-EngineEvent PowerShell.Exiting -Action { Stop-ServerJob } | Out-Null

Write-Host "Airship RTDS Data Collection Audit" -ForegroundColor Cyan
Write-Host "Folder: $Root"
Write-Host ""

# Finds Node, or offers to install a private copy in .node\ when there is none.
. (Join-Path $PSScriptRoot "Ensure-Node.ps1")
if (-not (Ensure-NodeAvailable -Root $Root)) {
  exit 1
}

if (Test-AppUp) {
  Write-Host "Already running - reopening $AppUrl" -ForegroundColor Green
  Start-Process $AppUrl | Out-Null
  exit 0
}

. (Join-Path $PSScriptRoot "Prepare-App.ps1")
Invoke-PrepareApp -Root $Root

# Makes the rtds-audit: link work, so the app's own page can restart it later.
# Never worth failing a launch over.
try {
  & (Join-Path $PSScriptRoot "Register-UrlHandler.ps1") -Quiet
} catch {
  Write-Host "Could not register the rtds-audit: link." -ForegroundColor Yellow
}

Write-Host "Starting on port $Port..."
$ServerJob = Start-Job -ScriptBlock {
  param($Root, $Log, $Port)
  Set-Location (Join-Path $Root "server")
  $env:PORT = $Port
  npm start *> $Log
} -ArgumentList $Root, $LogFile, $Port

$ready = $false
for ($i = 0; $i -lt 60; $i++) {
  if (Test-AppUp) { $ready = $true; break }
  if ($ServerJob.State -eq "Failed" -or $ServerJob.State -eq "Completed") { break }
  Start-Sleep -Milliseconds 250
}

if (-not $ready) {
  Write-Host "The app did not come up on port $Port." -ForegroundColor Red
  Write-Host ""
  Write-Host "Last lines of the log ($LogFile):"
  if (Test-Path $LogFile) { Get-Content $LogFile -Tail 20 }
  Stop-ServerJob
  exit 1
}

Start-Process $AppUrl | Out-Null

Write-Host ""
Write-Host "Ready: $AppUrl" -ForegroundColor Green
if (-not (Test-Path "config/rtds-profiles.json")) {
  Write-Host "First run: open the Projects screen and add an RTDS token to get started." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "Keep this window open while you use the app."
Write-Host "Press Ctrl+C, or close this window, to stop it."
Write-Host ""
Write-Host "Log file: $LogFile"
Write-Host ""

try {
  while ($true) {
    if ($ServerJob.State -eq "Failed" -or $ServerJob.State -eq "Completed") {
      Write-Host "The app stopped. Check the log: $LogFile" -ForegroundColor Red
      break
    }
    Start-Sleep -Seconds 2
  }
} finally {
  Stop-ServerJob
}
