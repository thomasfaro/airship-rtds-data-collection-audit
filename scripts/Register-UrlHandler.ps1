# Registers rtds-audit: links against this copy of the app, so a browser page can
# start the tool. Per-user keys only: no administrator rights involved.
#
#   -Quiet   only speak up when something is actually written or fails
param([switch]$Quiet)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Scheme = "rtds-audit"
$KeyPath = "HKCU:\Software\Classes\$Scheme"
$Launcher = Join-Path $Root "scripts\start-detached.ps1"
$Command = "`"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe`" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$Launcher`""

$existing = (Get-ItemProperty -Path "$KeyPath\shell\open\command" -Name "(default)" -ErrorAction SilentlyContinue)."(default)"
if ($existing -eq $Command) {
  if (-not $Quiet) { Write-Host "Already registered: $Scheme links start this copy." }
  exit 0
}

New-Item -Path "$KeyPath\shell\open\command" -Force | Out-Null
Set-ItemProperty -Path $KeyPath -Name "(default)" -Value "URL:RTDS Data Collection Audit"
Set-ItemProperty -Path $KeyPath -Name "URL Protocol" -Value ""
Set-ItemProperty -Path "$KeyPath\shell\open\command" -Name "(default)" -Value $Command

Write-Host "Registered $Scheme links, which is how the app's own page can restart it."
