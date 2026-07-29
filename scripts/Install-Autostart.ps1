# Makes the app start with the session and stay up, so the browser is the only thing
# anyone has to open. Undo it with "Remove background start.bat".
#
# Called by "Install background start.bat".
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$TaskName = "Airship RTDS Data Collection Audit"
$Port = if ($env:PORT) { $env:PORT } else { "3011" }
$AppUrl = "http://127.0.0.1:$Port"
$HealthUrl = "$AppUrl/api/health"
$LogFile = Join-Path $env:TEMP "rtds-dca.log"

function Test-AppUp {
  try {
    return (Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 2).StatusCode -eq 200
  } catch {
    return $false
  }
}

Write-Host "Airship RTDS Data Collection Audit - start with my session" -ForegroundColor Cyan
Write-Host "Folder: $Root"
Write-Host ""

. (Join-Path $PSScriptRoot "Ensure-Node.ps1")
if (-not (Ensure-NodeAvailable -Root $Root)) {
  Write-Host "Nothing was installed." -ForegroundColor Red
  exit 1
}

# Doing this now means the first automatic start is instant, and any install or build
# problem shows up in this window instead of in a log file nobody reads.
. (Join-Path $PSScriptRoot "Prepare-App.ps1")
Invoke-PrepareApp -Root $Root

Write-Host "Registering the background task..."

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument ("-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"" +
    (Join-Path $Root "scripts\serve.ps1") + "`"") `
  -WorkingDirectory $Root
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Runs the RTDS Data Collection Audit tool so http://127.0.0.1:$Port is always available." `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

$ready = $false
for ($i = 0; $i -lt 240; $i++) {
  if (Test-AppUp) { $ready = $true; break }
  Start-Sleep -Milliseconds 250
}

if (-not $ready) {
  Write-Host "The task is registered but the app did not answer on port $Port." -ForegroundColor Red
  Write-Host ""
  Write-Host "Last lines of the log ($LogFile):"
  if (Test-Path $LogFile) { Get-Content $LogFile -Tail 20 }
  Write-Host ""
  Write-Host "Remove it again with `"Remove background start.bat`"."
  exit 1
}

try {
  & (Join-Path $PSScriptRoot "Register-UrlHandler.ps1") -Quiet
} catch {
  Write-Host "Could not register the rtds-audit: link." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done - the tool is running and will start with your session." -ForegroundColor Green
Write-Host ""
Write-Host "  Open it any time at: $AppUrl"
Write-Host "  Bookmark that address, or use the Install app button in the interface"
Write-Host "  to get an icon in your Start menu."
Write-Host ""
if (-not (Test-Path "config/rtds-profiles.json")) {
  Write-Host "First run: open the Projects screen and add an RTDS token to get started." -ForegroundColor Yellow
  Write-Host ""
}
Write-Host "To undo this, double-click `"Remove background start.bat`"."
