# The app as a background service: no window, no questions, no browser.
#
# Stays in the foreground on purpose. The scheduled task that runs it expects to own
# the process, so backgrounding here would only hide it from its supervisor.
$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

$Port = if ($env:PORT) { $env:PORT } else { "3011" }

# Unattended by definition: there is nobody here to answer a question about Node.
if (-not $env:RTDS_DCA_AUTO_INSTALL_NODE) {
  $env:RTDS_DCA_AUTO_INSTALL_NODE = "1"
}

. (Join-Path $PSScriptRoot "Ensure-Node.ps1")
if (-not (Ensure-NodeAvailable -Root $Root)) {
  Write-Error "No usable Node.js, and installing a private copy failed."
  exit 1
}

. (Join-Path $PSScriptRoot "Prepare-App.ps1")
Invoke-PrepareApp -Root $Root

# The server reads its config and resolves its data directories from the working
# directory, exactly as `npm start --prefix server` gives it.
Set-Location (Join-Path $Root "server")
$env:PORT = $Port
Write-Host "[serve] $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') starting on port $Port"
node src/index.js
