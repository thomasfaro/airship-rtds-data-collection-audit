# Undoes "Install background start": the app stops and no longer starts with the
# session. Nothing else is touched - projects, saved audits and the app folder stay.
#
# Called by "Remove background start.bat".
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$TaskName = "Airship RTDS Data Collection Audit"

Write-Host "Airship RTDS Data Collection Audit - stop starting with my session" -ForegroundColor Cyan
Write-Host ""

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($task) {
  Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "The background task is gone and the app has stopped."
} else {
  Write-Host "There was no background task to remove."
}

Write-Host ""
Write-Host "To use the tool again, double-click `"Start RTDS Data Collection Audit.bat`""
Write-Host "in $Root."
